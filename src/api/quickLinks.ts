import { supabase } from './supabase';

export interface QuickLink {
  id: string;
  household_id: string;
  name: string;
  url: string;
  sort_order: number;
  created_at: string;
}

export async function fetchQuickLinks(householdId: string): Promise<QuickLink[]> {
  const { data, error } = await supabase
    .from('tf_quick_links')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data ?? []) as QuickLink[];
}

export async function createQuickLink(args: {
  household_id: string;
  name: string;
  url: string;
}): Promise<QuickLink> {
  let url = args.url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const { data, error } = await supabase
    .from('tf_quick_links')
    .insert({ household_id: args.household_id, name: args.name.trim(), url })
    .select('*')
    .single();
  if (error) throw error;
  return data as QuickLink;
}

export async function updateQuickLink(
  id: string,
  patch: Partial<Pick<QuickLink, 'name' | 'url'>>,
): Promise<void> {
  const cleaned: Partial<Pick<QuickLink, 'name' | 'url'>> = {};
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.url !== undefined) {
    let url = patch.url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    cleaned.url = url;
  }
  const { error } = await supabase.from('tf_quick_links').update(cleaned).eq('id', id);
  if (error) throw error;
}

export async function deleteQuickLink(id: string): Promise<void> {
  const { error } = await supabase.from('tf_quick_links').delete().eq('id', id);
  if (error) throw error;
}
