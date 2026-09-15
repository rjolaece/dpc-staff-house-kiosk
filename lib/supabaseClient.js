import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://amonulcpynfpkmbiqgjt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtb251bGNweW5mcGttYmlxZ2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTA1NzMsImV4cCI6MjEwNTAyNjU3M30.MPfl8hnxfs1anREEMOmhg8L_i7af0utHLlYkhx4x4p4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);