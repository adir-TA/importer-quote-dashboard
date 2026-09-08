import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  emptyPayload, normalizePayload, DEFAULT_BRANCH_GROUPS, branchesToText,
} from '../utils/containerModel';

const ContainersContext = createContext(null);

// Free-text edits fire per keystroke, so writes are debounced. Discrete
// actions (create, delete, branch changes) flush immediately.
const SAVE_DEBOUNCE_MS = 500;

export function ContainersProvider({ children }) {
  const { user } = useAuth();

  const [containers, setContainers] = useState([]);   // list rows, no payload
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // ------------------------------------------------
  // Loading
  // ------------------------------------------------
  const fetchAll = useCallback(async () => {
    if (!user) {
      setContainers([]); setBranches([]); setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [containersRes, branchesRes] = await Promise.all([
        supabase
          .from('containers')
          .select('id, name, container_no, version, created_at, updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('branches')
          .select('*')
          .order('group_index', { ascending: true })
          .order('sort_order', { ascending: true }),
      ]);

      if (containersRes.error) throw containersRes.error;
      if (branchesRes.error) throw branchesRes.error;

      setContainers(containersRes.data || []);
      setBranches(branchesRes.data || []);
      setLoadError(null);
    } catch (error) {
      console.error('[Containers] Failed to load:', error);
      setLoadError(error.message || 'Could not load containers');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ------------------------------------------------
  // Branches (the per-user master list)
  // ------------------------------------------------
  /** Seed the default branch list for an account that has none yet. */
  const seedBranches = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');

    const rows = [];
    DEFAULT_BRANCH_GROUPS.forEach((group, gi) => {
      group.forEach((name, si) => {
        rows.push({ user_id: user.id, name, group_index: gi, sort_order: si });
      });
    });

    const { data, error } = await supabase
      .from('branches')
      .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })
      .select();

    if (error) throw error;
    await fetchAll();
    return data;
  }, [user, fetchAll]);

  /** Replace the whole branch list from the grouped textarea format. */
  const saveBranches = useCallback(async (names, groups) => {
    if (!user) throw new Error('Not authenticated');

    // Delete-then-insert keeps ordering and grouping exactly as typed, which
    // a per-row diff would not: branches are few and edited rarely.
    const { error: delError } = await supabase.from('branches').delete().eq('user_id', user.id);
    if (delError) throw delError;

    if (names.length) {
      const seenPerGroup = {};
      const rows = names.map((name, i) => {
        const g = groups[i] ?? 0;
        seenPerGroup[g] = (seenPerGroup[g] ?? -1) + 1;
        return { user_id: user.id, name, group_index: g, sort_order: seenPerGroup[g] };
      });
      const { error } = await supabase.from('branches').insert(rows);
      if (error) throw error;
    }

    await fetchAll();
  }, [user, fetchAll]);

  /** Active branches as { names, groups }, ready to seed a new container. */
  const activeBranchList = useMemo(() => {
    const active = branches.filter(b => !b.archived);
    return {
      names: active.map(b => b.name),
      groups: active.map(b => b.group_index),
    };
  }, [branches]);

  // ------------------------------------------------
  // Containers
  // ------------------------------------------------
  const createContainer = useCallback(async ({ name, containerNo } = {}) => {
    if (!user) throw new Error('Not authenticated');

    // A new container starts with every active branch already in the grid.
    // Real containers leave 7-8 branches blank rather than removing them, so
    // asking the user to pick would be friction for no benefit.
    const { names, groups } = activeBranchList;
    const payload = {
      ...emptyPayload(),
      stores: names,
      storeGroups: groups,
      draftStores: branchesToText(names, groups),
    };

    const { data, error } = await supabase
      .from('containers')
      .insert({
        user_id: user.id,
        name: name || '',
        container_no: containerNo || '',
        payload,
      })
      .select()
      .single();

    if (error) throw error;
    setContainers(prev => [data, ...prev]);
    return data;
  }, [user, activeBranchList]);

  const deleteContainer = useCallback(async (id) => {
    const { error } = await supabase.from('containers').delete().eq('id', id);
    if (error) throw error;
    setContainers(prev => prev.filter(c => c.id !== id));
  }, []);

  const duplicateContainer = useCallback(async (id) => {
    if (!user) throw new Error('Not authenticated');

    const { data: source, error: readError } = await supabase
      .from('containers').select('*').eq('id', id).single();
    if (readError) throw readError;

    const { data, error } = await supabase
      .from('containers')
      .insert({
        user_id: user.id,
        name: `${source.name} (העתק)`,
        container_no: '',
        payload: source.payload,
      })
      .select()
      .single();

    if (error) throw error;
    setContainers(prev => [data, ...prev]);
    return data;
  }, [user]);

  /** Load one container in full, payload included. */
  const loadContainer = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('containers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, payload: normalizePayload(data.payload) };
  }, []);

  // ------------------------------------------------
  // Saving
  // ------------------------------------------------
  const saveTimer = useRef(null);
  const pending = useRef(null);
  const saveChain = useRef(Promise.resolve());

  const writeNow = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (!pending.current) return saveChain.current;

    saveChain.current = saveChain.current.then(async () => {
      const job = pending.current;
      if (!job) return;

      try {
        const { data, error } = await supabase
          .from('containers')
          .update({
            name: job.name,
            container_no: job.containerNo,
            payload: job.payload,
          })
          .eq('id', job.id)
          // Optimistic concurrency: refuse to clobber a newer version written
          // from another device. The trigger bumps `version` on every write.
          .eq('version', job.version)
          .select('id, name, container_no, version, updated_at')
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          // No row matched, so `version` had moved on
          setSaveError('STALE');
          return;
        }

        if (pending.current === job) pending.current = null;
        job.onSaved?.(data.version);

        setContainers(prev => prev.map(c => (c.id === data.id ? { ...c, ...data } : c)));
        setSaveError(null);
        setSavedAt(new Date());
      } catch (error) {
        console.error('[Containers] Save failed:', error);
        setSaveError(error.message || 'Could not save');
      }
    });

    return saveChain.current;
  }, []);

  /** Queue a save. `immediate` skips the debounce for discrete actions. */
  const queueSave = useCallback((job, immediate = false) => {
    pending.current = job;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) return writeNow();
    saveTimer.current = setTimeout(writeNow, SAVE_DEBOUNCE_MS);
    return null;
  }, [writeNow]);

  // Best effort: browsers cancel non-keepalive requests during teardown, so
  // the real protections are the short debounce and the flush on blur.
  useEffect(() => {
    const flush = () => writeNow();
    const onVisibility = () => { if (document.visibilityState === 'hidden') writeNow(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      writeNow();
    };
  }, [writeNow]);

  const value = useMemo(() => ({
    containers, branches, activeBranchList,
    loading, loadError, saveError, savedAt,
    refresh: fetchAll,
    seedBranches, saveBranches,
    createContainer, deleteContainer, duplicateContainer, loadContainer,
    queueSave, flushSave: writeNow,
    clearSaveError: () => setSaveError(null),
  }), [
    containers, branches, activeBranchList, loading, loadError, saveError, savedAt,
    fetchAll, seedBranches, saveBranches,
    createContainer, deleteContainer, duplicateContainer, loadContainer,
    queueSave, writeNow,
  ]);

  return <ContainersContext.Provider value={value}>{children}</ContainersContext.Provider>;
}

export function useContainers() {
  const ctx = useContext(ContainersContext);
  if (!ctx) throw new Error('useContainers must be used within a ContainersProvider');
  return ctx;
}

export default ContainersContext;
