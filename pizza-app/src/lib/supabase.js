import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://icyadikqqfcnrxqinqnu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_1VveTC4yAJyLXc9dQcHS4w_14Y2FmH3'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
