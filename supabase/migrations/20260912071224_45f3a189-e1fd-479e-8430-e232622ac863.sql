ALTER POLICY "Users can create conversations" ON public.ai_conversations TO authenticated;
ALTER POLICY "Users can delete own conversations" ON public.ai_conversations TO authenticated;
ALTER POLICY "Users can view own conversations" ON public.ai_conversations TO authenticated;
ALTER POLICY "Admins can view audit logs" ON public.audit_logs TO authenticated;
ALTER POLICY "Tenant members can view calculations" ON public.calculations TO authenticated;
