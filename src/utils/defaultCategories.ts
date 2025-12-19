export interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
}

export const defaultCategories: DefaultCategory[] = [
  { name: "Food & Dining", icon: "🍔", color: "#ef4444" },
  { name: "Transport", icon: "🚗", color: "#3b82f6" },
  { name: "Rent & Utilities", icon: "🏠", color: "#8b5cf6" },
  { name: "Entertainment", icon: "🎬", color: "#ec4899" },
  { name: "Shopping", icon: "🛍️", color: "#f97316" },
  { name: "Healthcare", icon: "💊", color: "#10b981" },
  { name: "Other", icon: "📦", color: "#6b7280" },
];
