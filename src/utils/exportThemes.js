// Shared export themes for both Quote Comparison and RFQ Excel exports
export const EXPORT_THEMES = {
  vibrant: {
    name: 'Vibrant & Modern',
    description: 'Bold colors with high contrast',
    preview: ['#2563EB', '#A7F3D0', '#FEF9C3', '#E0E7FF'],
    colors: {
      title: { bg: 'FF2563EB', text: 'FFFFFFFF' },
      imagePlaceholder: { bg: 'FFDBEAFE', text: 'FF1E40AF', border: 'FF3B82F6' },
      productName: { bg: 'FFFEF3C7', text: 'FF92400E' },
      category: { bg: 'FFE0E7FF', text: 'FF3730A3' },
      date: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
      totalQuotes: { bg: 'FFD1FAE5', text: 'FF065F46' },
      header: { bg: 'FF1E293B', text: 'FFFFFFFF' },
      bestPrice: { bg: 'FFA7F3D0', text: 'FF065F46', border: 'FF10B981', status: 'FFEA580C' },
      rankColumn: { bg: 'FFEFF6FF' },
      priceColumn: { bg: 'FFFEF9C3' },
      savingsColumn: { bg: 'FFD1FAE5', text: 'FF065F46' },
      alternatingRow: { odd: 'FFF8FAFC', even: 'FFFFFFFF' },
      infoRow: { bg: 'FFF1F5F9', text: 'FF475569' }
    }
  },
  corporate: {
    name: 'Professional Corporate',
    description: 'Navy blue with subtle accents',
    preview: ['#1E3A8A', '#E0E7FF', '#F1F5F9', '#DBEAFE'],
    colors: {
      title: { bg: 'FF1E3A8A', text: 'FFFFFFFF' },
      imagePlaceholder: { bg: 'FFE0E7FF', text: 'FF1E3A8A', border: 'FF3B82F6' },
      productName: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
      category: { bg: 'FFF1F5F9', text: 'FF475569' },
      date: { bg: 'FFF1F5F9', text: 'FF475569' },
      totalQuotes: { bg: 'FFE0E7FF', text: 'FF1E3A8A' },
      header: { bg: 'FF334155', text: 'FFFFFFFF' },
      bestPrice: { bg: 'FFBFDBFE', text: 'FF1E3A8A', border: 'FF3B82F6', status: 'FF1E3A8A' },
      rankColumn: { bg: 'FFDBEAFE' },
      priceColumn: { bg: 'FFDBEAFE' },
      savingsColumn: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
      alternatingRow: { odd: 'FFF8FAFC', even: 'FFFFFFFF' },
      infoRow: { bg: 'FFF1F5F9', text: 'FF475569' }
    }
  },
  minimal: {
    name: 'Modern Minimal',
    description: 'Clean black & white with subtle grays',
    preview: ['#000000', '#F3F4F6', '#E5E7EB', '#D1D5DB'],
    colors: {
      title: { bg: 'FF000000', text: 'FFFFFFFF' },
      imagePlaceholder: { bg: 'FFF3F4F6', text: 'FF374151', border: 'FF9CA3AF' },
      productName: { bg: 'FFE5E7EB', text: 'FF111827' },
      category: { bg: 'FFF9FAFB', text: 'FF6B7280' },
      date: { bg: 'FFF9FAFB', text: 'FF6B7280' },
      totalQuotes: { bg: 'FFE5E7EB', text: 'FF374151' },
      header: { bg: 'FF374151', text: 'FFFFFFFF' },
      bestPrice: { bg: 'FFD1D5DB', text: 'FF000000', border: 'FF6B7280', status: 'FF000000' },
      rankColumn: { bg: 'FFF3F4F6' },
      priceColumn: { bg: 'FFF3F4F6' },
      savingsColumn: { bg: 'FFE5E7EB', text: 'FF374151' },
      alternatingRow: { odd: 'FFFAFAFA', even: 'FFFFFFFF' },
      infoRow: { bg: 'FFF3F4F6', text: 'FF374151' }
    }
  },
  elegant: {
    name: 'Elegant Warm',
    description: 'Burgundy & gold tones',
    preview: ['#7C2D12', '#FEF3C7', '#FED7AA', '#FECACA'],
    colors: {
      title: { bg: 'FF7C2D12', text: 'FFFFFFFF' },
      imagePlaceholder: { bg: 'FFFED7AA', text: 'FF7C2D12', border: 'FFFB923C' },
      productName: { bg: 'FFFEF3C7', text: 'FF78350F' },
      category: { bg: 'FFFECACA', text: 'FF991B1B' },
      date: { bg: 'FFFED7AA', text: 'FFEA580C' },
      totalQuotes: { bg: 'FFFEF3C7', text: 'FF92400E' },
      header: { bg: 'FF7C2D12', text: 'FFFFFFFF' },
      bestPrice: { bg: 'FFFDE68A', text: 'FF713F12', border: 'FFF59E0B', status: 'FFDC2626' },
      rankColumn: { bg: 'FFFEF3C7' },
      priceColumn: { bg: 'FFFEF3C7' },
      savingsColumn: { bg: 'FFFDE68A', text: 'FF78350F' },
      alternatingRow: { odd: 'FFFFFBEB', even: 'FFFFFFFF' },
      infoRow: { bg: 'FFFEF3C7', text: 'FF78350F' }
    }
  }
};
