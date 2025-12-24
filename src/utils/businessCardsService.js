import { supabase } from '../lib/supabase';

// ============================================================================
// BUSINESS CARDS CRUD
// ============================================================================

export const fetchBusinessCards = async (userId) => {
  const { data, error } = await supabase
    .from('business_cards')
    .select(`
      *,
      category:card_categories(id, name, color),
      images:business_card_images(id, storage_path, file_name, sort_order),
      tag_map:business_card_tag_map(
        tag:business_card_tags(id, name)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Flatten tag structure
  return data.map(card => ({
    ...card,
    tags: card.tag_map?.map(tm => tm.tag).filter(Boolean) || [],
    tag_map: undefined
  }));
};

export const createBusinessCard = async (cardData, userId) => {
  const { data, error } = await supabase
    .from('business_cards')
    .insert({
      user_id: userId,
      category_id: cardData.category_id || null,
      supplier_id: cardData.supplier_id || null,
      display_name: cardData.display_name,
      company_name: cardData.company_name || null,
      contact_person: cardData.contact_person || null,
      phone: cardData.phone || null,
      wechat: cardData.wechat || null,
      email: cardData.email || null,
      website: cardData.website || null,
      notes: cardData.notes || null,
      status: cardData.status || 'new',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateBusinessCard = async (cardId, updates, userId) => {
  const { data, error } = await supabase
    .from('business_cards')
    .update({
      category_id: updates.category_id !== undefined ? updates.category_id : undefined,
      supplier_id: updates.supplier_id !== undefined ? updates.supplier_id : undefined,
      display_name: updates.display_name,
      company_name: updates.company_name,
      contact_person: updates.contact_person,
      phone: updates.phone,
      wechat: updates.wechat,
      email: updates.email,
      website: updates.website,
      notes: updates.notes,
      status: updates.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteBusinessCard = async (cardId, userId) => {
  // Delete card images from storage first
  const images = await fetchCardImages(cardId, userId);
  for (const img of images) {
    await deleteCardImage(img.id, userId);
  }

  // Delete card (cascade will handle images/tags)
  const { error } = await supabase
    .from('business_cards')
    .delete()
    .eq('id', cardId)
    .eq('user_id', userId);

  if (error) throw error;
};

// ============================================================================
// CATEGORIES
// ============================================================================

export const fetchCardCategories = async (userId) => {
  console.log('[fetchCardCategories] Fetching for userId:', userId);

  const { data, error } = await supabase
    .from('card_categories')
    .select('*')
    .eq('user_id', userId)
    .order('name');

  console.log('[fetchCardCategories] Response:', { data, error });

  if (error) {
    console.error('[fetchCardCategories] Error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    throw error;
  }

  return data;
};

export const createCardCategory = async (name, color, userId) => {
  console.log('[createCardCategory] Creating:', { name, color, userId });

  const { data, error } = await supabase
    .from('card_categories')
    .insert({
      user_id: userId,
      name,
      color: color || '#3b82f6',
    })
    .select()
    .single();

  console.log('[createCardCategory] Response:', { data, error });

  if (error) {
    console.error('[createCardCategory] Error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    throw error;
  }

  return data;
};

export const updateCardCategory = async (categoryId, name, color, userId) => {
  const { data, error } = await supabase
    .from('card_categories')
    .update({ name, color })
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteCardCategory = async (categoryId, userId) => {
  const { error } = await supabase
    .from('card_categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId);

  if (error) throw error;
};

// ============================================================================
// TAGS
// ============================================================================

export const fetchCardTags = async (userId) => {
  const { data, error } = await supabase
    .from('business_card_tags')
    .select('*')
    .eq('user_id', userId)
    .order('name');

  if (error) throw error;
  return data;
};

export const createCardTag = async (name, userId) => {
  const { data, error } = await supabase
    .from('business_card_tags')
    .insert({
      user_id: userId,
      name,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteCardTag = async (tagId, userId) => {
  const { error } = await supabase
    .from('business_card_tags')
    .delete()
    .eq('id', tagId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const setCardTags = async (cardId, tagIds, userId) => {
  // Remove existing tags
  await supabase
    .from('business_card_tag_map')
    .delete()
    .eq('card_id', cardId)
    .eq('user_id', userId);

  // Add new tags
  if (tagIds.length > 0) {
    const mappings = tagIds.map(tagId => ({
      card_id: cardId,
      tag_id: tagId,
      user_id: userId,
    }));

    const { error } = await supabase
      .from('business_card_tag_map')
      .insert(mappings);

    if (error) throw error;
  }
};

// ============================================================================
// IMAGES
// ============================================================================

export const fetchCardImages = async (cardId, userId) => {
  const { data, error } = await supabase
    .from('business_card_images')
    .select('*')
    .eq('card_id', cardId)
    .eq('user_id', userId)
    .order('sort_order');

  if (error) throw error;
  return data;
};

export const uploadCardImage = async (cardId, file, sortOrder, userId) => {
  // Generate unique filename
  const fileExt = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const storagePath = `${userId}/${cardId}/${fileName}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('business-cards')
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  // Create database record
  const { data, error } = await supabase
    .from('business_card_images')
    .insert({
      card_id: cardId,
      user_id: userId,
      storage_path: storagePath,
      file_name: file.name,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteCardImage = async (imageId, userId) => {
  // Get image info
  const { data: image, error: fetchError } = await supabase
    .from('business_card_images')
    .select('storage_path')
    .eq('id', imageId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw fetchError;

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('business-cards')
    .remove([image.storage_path]);

  if (storageError) throw storageError;

  // Delete database record
  const { error } = await supabase
    .from('business_card_images')
    .delete()
    .eq('id', imageId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const reorderCardImages = async (cardId, imageIdsInOrder, userId) => {
  for (let i = 0; i < imageIdsInOrder.length; i++) {
    await supabase
      .from('business_card_images')
      .update({ sort_order: i })
      .eq('id', imageIdsInOrder[i])
      .eq('card_id', cardId)
      .eq('user_id', userId);
  }
};

export const getCardImageUrl = (storagePath) => {
  const { data } = supabase.storage
    .from('business-cards')
    .getPublicUrl(storagePath);

  return data.publicUrl;
};

// ============================================================================
// BULK OPERATIONS
// ============================================================================

export const bulkUpdateCardStatus = async (cardIds, status, userId) => {
  const { error } = await supabase
    .from('business_cards')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', cardIds)
    .eq('user_id', userId);

  if (error) throw error;
};

export const bulkUpdateCardCategory = async (cardIds, categoryId, userId) => {
  const { error } = await supabase
    .from('business_cards')
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .in('id', cardIds)
    .eq('user_id', userId);

  if (error) throw error;
};

export const bulkDeleteCards = async (cardIds, userId) => {
  for (const cardId of cardIds) {
    await deleteBusinessCard(cardId, userId);
  }
};

// ============================================================================
// UTILITIES
// ============================================================================

export const checkDuplicateCard = async (email, wechat, phone, userId, excludeCardId = null) => {
  let query = supabase
    .from('business_cards')
    .select('id, display_name, email, wechat, phone')
    .eq('user_id', userId);

  if (excludeCardId) {
    query = query.neq('id', excludeCardId);
  }

  const conditions = [];
  if (email) conditions.push(`email.eq.${email}`);
  if (wechat) conditions.push(`wechat.eq.${wechat}`);
  if (phone) conditions.push(`phone.eq.${phone}`);

  if (conditions.length === 0) return [];

  // Check each field separately and combine results
  const duplicates = [];
  if (email) {
    const { data } = await supabase
      .from('business_cards')
      .select('id, display_name, email, wechat, phone')
      .eq('user_id', userId)
      .eq('email', email)
      .neq('id', excludeCardId || '');
    if (data && data.length > 0) duplicates.push(...data);
  }
  if (wechat) {
    const { data } = await supabase
      .from('business_cards')
      .select('id, display_name, email, wechat, phone')
      .eq('user_id', userId)
      .eq('wechat', wechat)
      .neq('id', excludeCardId || '');
    if (data && data.length > 0) {
      data.forEach(d => {
        if (!duplicates.find(dup => dup.id === d.id)) {
          duplicates.push(d);
        }
      });
    }
  }
  if (phone) {
    const { data } = await supabase
      .from('business_cards')
      .select('id, display_name, email, wechat, phone')
      .eq('user_id', userId)
      .eq('phone', phone)
      .neq('id', excludeCardId || '');
    if (data && data.length > 0) {
      data.forEach(d => {
        if (!duplicates.find(dup => dup.id === d.id)) {
          duplicates.push(d);
        }
      });
    }
  }

  return duplicates;
};

export const searchCards = async (searchTerm, userId) => {
  const { data, error } = await supabase
    .from('business_cards')
    .select(`
      *,
      category:card_categories(id, name, color),
      images:business_card_images(id, storage_path, file_name, sort_order),
      tag_map:business_card_tag_map(
        tag:business_card_tags(id, name)
      )
    `)
    .eq('user_id', userId)
    .or(`display_name.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%,contact_person.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,wechat.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map(card => ({
    ...card,
    tags: card.tag_map?.map(tm => tm.tag).filter(Boolean) || [],
    tag_map: undefined
  }));
};
