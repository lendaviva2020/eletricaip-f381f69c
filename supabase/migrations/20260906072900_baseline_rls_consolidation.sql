-- Baseline RLS consolidation
-- Gerado a partir de pg_tables + pg_policies do banco real (schema public).
-- Objetivo: reprodutibilidade. Rodar esta migration contra o banco atual e um
-- NO-OP total (ENABLE RLS e idempotente; cada policy e recriada identica via
-- DROP POLICY IF EXISTS + CREATE POLICY copiado literalmente de pg_policies).
-- NAO altere a logica das policies aqui; este arquivo apenas documenta o estado
-- existente (65 tabelas com RLS, 168 policies, md5 d7d93fae16040874315883b6fb5f6100).

-- =====================================================================
-- 1) ENABLE ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rate_limit_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarm_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_component_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electrical_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_block_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_command_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_webhook_processed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normative_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normative_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_samples_2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_samples_2026_05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_function_block_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voltai_feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voltai_learning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voltai_training_scenarios ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 2) POLICIES (copia literal de pg_policies)
-- =====================================================================
DROP POLICY IF EXISTS "Users can create conversations" ON public.ai_conversations;
CREATE POLICY "Users can create conversations" ON public.ai_conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.ai_conversations;
CREATE POLICY "Users can delete own conversations" ON public.ai_conversations AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own conversations" ON public.ai_conversations;
CREATE POLICY "Users can update own conversations" ON public.ai_conversations AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own conversations" ON public.ai_conversations;
CREATE POLICY "Users can view own conversations" ON public.ai_conversations AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "ai_credit_costs admin write" ON public.ai_credit_costs;
CREATE POLICY "ai_credit_costs admin write" ON public.ai_credit_costs AS PERMISSIVE FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "ai_credit_costs read for authenticated" ON public.ai_credit_costs;
CREATE POLICY "ai_credit_costs read for authenticated" ON public.ai_credit_costs AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Users can insert messages in own conversations" ON public.ai_messages;
CREATE POLICY "Users can insert messages in own conversations" ON public.ai_messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ai_conversations
  WHERE ((ai_conversations.id = ai_messages.conversation_id) AND (ai_conversations.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.ai_messages;
CREATE POLICY "Users can view messages in own conversations" ON public.ai_messages AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ai_conversations
  WHERE ((ai_conversations.id = ai_messages.conversation_id) AND (ai_conversations.user_id = auth.uid())))));
DROP POLICY IF EXISTS "platform admins can delete rate limit configs" ON public.ai_rate_limit_configs;
CREATE POLICY "platform admins can delete rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_platform_admin());
DROP POLICY IF EXISTS "platform admins can insert rate limit configs" ON public.ai_rate_limit_configs;
CREATE POLICY "platform admins can insert rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "platform admins can read rate limit configs" ON public.ai_rate_limit_configs;
CREATE POLICY "platform admins can read rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());
DROP POLICY IF EXISTS "platform admins can update rate limit configs" ON public.ai_rate_limit_configs;
CREATE POLICY "platform admins can update rate limit configs" ON public.ai_rate_limit_configs AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "members can read tenant ai events" ON public.ai_status_events;
CREATE POLICY "members can read tenant ai events" ON public.ai_status_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = ai_status_events.tenant_id) AND (tm.user_id = auth.uid())))));
DROP POLICY IF EXISTS "users insert own tenant ai events" ON public.ai_status_events;
CREATE POLICY "users insert own tenant ai events" ON public.ai_status_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = ai_status_events.tenant_id) AND (tm.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "tenant members read own ai usage events" ON public.ai_usage_events;
CREATE POLICY "tenant members read own ai usage events" ON public.ai_usage_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
DROP POLICY IF EXISTS "Users can delete alarm configs in accessible projects" ON public.alarm_configs;
CREATE POLICY "Users can delete alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can manage alarm configs in accessible projects" ON public.alarm_configs;
CREATE POLICY "Users can manage alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can read alarm configs in accessible projects" ON public.alarm_configs;
CREATE POLICY "Users can read alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can update alarm configs in accessible projects" ON public.alarm_configs;
CREATE POLICY "Users can update alarm configs in accessible projects" ON public.alarm_configs AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can insert alarm history in accessible projects" ON public.alarm_history;
CREATE POLICY "Users can insert alarm history in accessible projects" ON public.alarm_history AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can read alarm history in accessible projects" ON public.alarm_history;
CREATE POLICY "Users can read alarm history in accessible projects" ON public.alarm_history AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can update alarm history in accessible projects" ON public.alarm_history;
CREATE POLICY "Users can update alarm history in accessible projects" ON public.alarm_history AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = alarm_history.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Admins can view API keys in their tenant" ON public.api_keys;
CREATE POLICY "Admins can view API keys in their tenant" ON public.api_keys AS PERMISSIVE FOR SELECT TO authenticated
  USING (((get_user_tenant_id() = tenant_id) AND (get_user_role() = ANY (ARRAY['owner'::text, 'admin'::text]))));
DROP POLICY IF EXISTS "Users can create their own API keys" ON public.api_keys;
CREATE POLICY "Users can create their own API keys" ON public.api_keys AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (tenant_id = get_user_tenant_id())));
DROP POLICY IF EXISTS "Users can delete their own API keys" ON public.api_keys;
CREATE POLICY "Users can delete their own API keys" ON public.api_keys AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update their own API keys" ON public.api_keys;
CREATE POLICY "Users can update their own API keys" ON public.api_keys AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
CREATE POLICY "Users can view their own API keys" ON public.api_keys AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Admins can view billing events" ON public.billing_events;
CREATE POLICY "Admins can view billing events" ON public.billing_events AS PERMISSIVE FOR SELECT TO public
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Anyone can read blog categories" ON public.blog_categories;
CREATE POLICY "Anyone can read blog categories" ON public.blog_categories AS PERMISSIVE FOR SELECT TO public
  USING (true);
DROP POLICY IF EXISTS "Platform admins can manage blog categories" ON public.blog_categories;
CREATE POLICY "Platform admins can manage blog categories" ON public.blog_categories AS PERMISSIVE FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "Anyone can read published blog posts" ON public.blog_posts;
CREATE POLICY "Anyone can read published blog posts" ON public.blog_posts AS PERMISSIVE FOR SELECT TO public
  USING ((status = 'published'::text));
DROP POLICY IF EXISTS "Platform admins can manage blog posts" ON public.blog_posts;
CREATE POLICY "Platform admins can manage blog posts" ON public.blog_posts AS PERMISSIVE FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "Engineers+ can manage calculations" ON public.calculations;
CREATE POLICY "Engineers+ can manage calculations" ON public.calculations AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = calculations.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = calculations.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Tenant members can view calculations" ON public.calculations;
CREATE POLICY "Tenant members can view calculations" ON public.calculations AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = calculations.project_id) AND (projects.tenant_id = get_user_tenant_id())))));
DROP POLICY IF EXISTS catalog_categories_delete_admin ON public.catalog_component_categories;
CREATE POLICY catalog_categories_delete_admin ON public.catalog_component_categories AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_categories_insert_admin ON public.catalog_component_categories;
CREATE POLICY catalog_categories_insert_admin ON public.catalog_component_categories AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_categories_select_auth ON public.catalog_component_categories;
CREATE POLICY catalog_categories_select_auth ON public.catalog_component_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS catalog_categories_update_admin ON public.catalog_component_categories;
CREATE POLICY catalog_categories_update_admin ON public.catalog_component_categories AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_components_delete_admin ON public.catalog_components;
CREATE POLICY catalog_components_delete_admin ON public.catalog_components AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_components_insert_admin ON public.catalog_components;
CREATE POLICY catalog_components_insert_admin ON public.catalog_components AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_components_select_auth ON public.catalog_components;
CREATE POLICY catalog_components_select_auth ON public.catalog_components AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS catalog_components_update_admin ON public.catalog_components;
CREATE POLICY catalog_components_update_admin ON public.catalog_components AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_manufacturers_delete_admin ON public.catalog_manufacturers;
CREATE POLICY catalog_manufacturers_delete_admin ON public.catalog_manufacturers AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_manufacturers_insert_admin ON public.catalog_manufacturers;
CREATE POLICY catalog_manufacturers_insert_admin ON public.catalog_manufacturers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS catalog_manufacturers_select_auth ON public.catalog_manufacturers;
CREATE POLICY catalog_manufacturers_select_auth ON public.catalog_manufacturers AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS catalog_manufacturers_update_admin ON public.catalog_manufacturers;
CREATE POLICY catalog_manufacturers_update_admin ON public.catalog_manufacturers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Engineers+ can delete clients" ON public.clients;
CREATE POLICY "Engineers+ can delete clients" ON public.clients AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Engineers+ can insert clients" ON public.clients;
CREATE POLICY "Engineers+ can insert clients" ON public.clients AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text])))))));
DROP POLICY IF EXISTS "Engineers+ can update clients" ON public.clients;
CREATE POLICY "Engineers+ can update clients" ON public.clients AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Tenant members can view clients" ON public.clients;
CREATE POLICY "Tenant members can view clients" ON public.clients AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = clients.tenant_id) AND (tm.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Users can delete own comments" ON public.comments AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert their own comments" ON public.comments;
CREATE POLICY "Users can insert their own comments" ON public.comments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
CREATE POLICY "Users can update own comments" ON public.comments AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their own comments" ON public.comments;
CREATE POLICY "Users can view their own comments" ON public.comments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Engineers+ can manage diagrams" ON public.diagrams;
CREATE POLICY "Engineers+ can manage diagrams" ON public.diagrams AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = diagrams.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = diagrams.project_id) AND (projects.tenant_id = get_user_tenant_id())))) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Tenant members can view diagrams" ON public.diagrams;
CREATE POLICY "Tenant members can view diagrams" ON public.diagrams AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = diagrams.project_id) AND (projects.tenant_id = get_user_tenant_id())))));
DROP POLICY IF EXISTS "Anyone can read components" ON public.electrical_components;
CREATE POLICY "Anyone can read components" ON public.electrical_components AS PERMISSIVE FOR SELECT TO public
  USING (true);
DROP POLICY IF EXISTS "Platform admins can manage feature flags" ON public.feature_flags;
CREATE POLICY "Platform admins can manage feature flags" ON public.feature_flags AS PERMISSIVE FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
DROP POLICY IF EXISTS "Platform admins can view feature flags" ON public.feature_flags;
CREATE POLICY "Platform admins can view feature flags" ON public.feature_flags AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin());
DROP POLICY IF EXISTS "Tenant admins can delete file versions" ON public.file_versions;
CREATE POLICY "Tenant admins can delete file versions" ON public.file_versions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (files f
     JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
  WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Tenant admins can update file versions" ON public.file_versions;
CREATE POLICY "Tenant admins can update file versions" ON public.file_versions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (files f
     JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
  WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (files f
     JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
  WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Tenant members can insert file versions" ON public.file_versions;
CREATE POLICY "Tenant members can insert file versions" ON public.file_versions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (files f
     JOIN tenant_memberships tm ON ((tm.tenant_id = f.tenant_id)))
  WHERE ((f.id = file_versions.file_id) AND (tm.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Tenant members can view file versions" ON public.file_versions;
CREATE POLICY "Tenant members can view file versions" ON public.file_versions AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM files
  WHERE ((files.id = file_versions.file_id) AND (files.tenant_id = get_user_tenant_id())))));
DROP POLICY IF EXISTS "Engineers+ can manage files" ON public.files;
CREATE POLICY "Engineers+ can manage files" ON public.files AS PERMISSIVE FOR ALL TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Tenant members can view files" ON public.files;
CREATE POLICY "Tenant members can view files" ON public.files AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "Users can delete function blocks in accessible projects" ON public.function_block_instances;
CREATE POLICY "Users can delete function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can insert function blocks in accessible projects" ON public.function_block_instances;
CREATE POLICY "Users can insert function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can manage function blocks in accessible projects" ON public.function_block_instances;
CREATE POLICY "Users can manage function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can update function blocks in accessible projects" ON public.function_block_instances;
CREATE POLICY "Users can update function blocks in accessible projects" ON public.function_block_instances AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = function_block_instances.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Admins can delete invites" ON public.invites;
CREATE POLICY "Admins can delete invites" ON public.invites AS PERMISSIVE FOR DELETE TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Admins can insert invites" ON public.invites;
CREATE POLICY "Admins can insert invites" ON public.invites AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Admins can list invite metadata" ON public.invites;
CREATE POLICY "Admins can list invite metadata" ON public.invites AS PERMISSIVE FOR SELECT TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Admins can update invites" ON public.invites;
CREATE POLICY "Admins can update invites" ON public.invites AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Admins can view invoices" ON public.invoices;
CREATE POLICY "Admins can view invoices" ON public.invoices AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "tenant admins read invoices" ON public.invoices;
CREATE POLICY "tenant admins read invoices" ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = invoices.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));
DROP POLICY IF EXISTS "Tenant members can delete alerts for their devices" ON public.iot_alerts;
CREATE POLICY "Tenant members can delete alerts for their devices" ON public.iot_alerts AS PERMISSIVE FOR DELETE TO public
  USING ((device_id IN ( SELECT d.id
   FROM iot_devices d
  WHERE (d.tenant_id IN ( SELECT tm.tenant_id
           FROM tenant_memberships tm
          WHERE (tm.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Users can view alerts of their tenant devices" ON public.iot_alerts;
CREATE POLICY "Users can view alerts of their tenant devices" ON public.iot_alerts AS PERMISSIVE FOR SELECT TO public
  USING ((device_id IN ( SELECT iot_devices.id
   FROM iot_devices
  WHERE (iot_devices.tenant_id IN ( SELECT tenant_memberships.tenant_id
           FROM tenant_memberships
          WHERE (tenant_memberships.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Engineers+ can insert command log" ON public.iot_command_log;
CREATE POLICY "Engineers+ can insert command log" ON public.iot_command_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Engineers+ can update command log" ON public.iot_command_log;
CREATE POLICY "Engineers+ can update command log" ON public.iot_command_log AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
  WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Users can view command log of their tenant" ON public.iot_command_log;
CREATE POLICY "Users can view command log of their tenant" ON public.iot_command_log AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_memberships.tenant_id
   FROM tenant_memberships
  WHERE (tenant_memberships.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can view devices of their tenant" ON public.iot_devices;
CREATE POLICY "Users can view devices of their tenant" ON public.iot_devices AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_memberships.tenant_id
   FROM tenant_memberships
  WHERE (tenant_memberships.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Block client deletes on iot_readings" ON public.iot_readings;
CREATE POLICY "Block client deletes on iot_readings" ON public.iot_readings AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);
DROP POLICY IF EXISTS "Block client inserts on iot_readings" ON public.iot_readings;
CREATE POLICY "Block client inserts on iot_readings" ON public.iot_readings AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "Block client updates on iot_readings" ON public.iot_readings;
CREATE POLICY "Block client updates on iot_readings" ON public.iot_readings AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS "Users can view readings of their tenant devices" ON public.iot_readings;
CREATE POLICY "Users can view readings of their tenant devices" ON public.iot_readings AS PERMISSIVE FOR SELECT TO public
  USING ((device_id IN ( SELECT iot_devices.id
   FROM iot_devices
  WHERE (iot_devices.tenant_id IN ( SELECT tenant_memberships.tenant_id
           FROM tenant_memberships
          WHERE (tenant_memberships.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Engineers plus can manage knowledge chunks" ON public.knowledge_chunks AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM knowledge_documents kd
  WHERE ((kd.id = knowledge_chunks.document_id) AND (kd.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM knowledge_documents kd
  WHERE ((kd.id = knowledge_chunks.document_id) AND (kd.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Tenant members can view knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Tenant members can view knowledge chunks" ON public.knowledge_chunks AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM knowledge_documents kd
  WHERE ((kd.id = knowledge_chunks.document_id) AND (kd.tenant_id = get_user_tenant_id())))));
DROP POLICY IF EXISTS "Engineers plus can manage knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Engineers plus can manage knowledge documents" ON public.knowledge_documents AS PERMISSIVE FOR ALL TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Tenant members can view knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Tenant members can view knowledge documents" ON public.knowledge_documents AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "No client access mp_webhook_processed" ON public.mp_webhook_processed;
CREATE POLICY "No client access mp_webhook_processed" ON public.mp_webhook_processed AS PERMISSIVE FOR ALL TO public
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS "Authenticated users can read normative chunks" ON public.normative_chunks;
CREATE POLICY "Authenticated users can read normative chunks" ON public.normative_chunks AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Service role can manage normative chunks" ON public.normative_chunks;
CREATE POLICY "Service role can manage normative chunks" ON public.normative_chunks AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can read normative documents" ON public.normative_documents;
CREATE POLICY "Authenticated users can read normative documents" ON public.normative_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Service role can manage normative documents" ON public.normative_documents;
CREATE POLICY "Service role can manage normative documents" ON public.normative_documents AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
DROP POLICY IF EXISTS "Users can insert notifications for themselves" ON public.notifications;
CREATE POLICY "Users can insert notifications for themselves" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (tenant_id = get_user_tenant_id())));
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Anyone can read plan limits" ON public.plan_limits;
CREATE POLICY "Anyone can read plan limits" ON public.plan_limits AS PERMISSIVE FOR SELECT TO public
  USING (true);
DROP POLICY IF EXISTS plant_telemetry_no_client_access ON public.plant_telemetry;
CREATE POLICY plant_telemetry_no_client_access ON public.plant_telemetry AS PERMISSIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS "Only superadmins can modify platform_admins" ON public.platform_admins;
CREATE POLICY "Only superadmins can modify platform_admins" ON public.platform_admins AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = auth.uid()) AND (pa.role = 'superadmin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE ((pa.user_id = auth.uid()) AND (pa.role = 'superadmin'::text)))));
DROP POLICY IF EXISTS "Platform admins can view platform_admins" ON public.platform_admins;
CREATE POLICY "Platform admins can view platform_admins" ON public.platform_admins AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((id = auth.uid()));
DROP POLICY IF EXISTS "Engineers+ delete BOM" ON public.project_bom_items;
CREATE POLICY "Engineers+ delete BOM" ON public.project_bom_items AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Engineers+ insert BOM" ON public.project_bom_items;
CREATE POLICY "Engineers+ insert BOM" ON public.project_bom_items AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Engineers+ update BOM" ON public.project_bom_items;
CREATE POLICY "Engineers+ update BOM" ON public.project_bom_items AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Tenant members view BOM" ON public.project_bom_items;
CREATE POLICY "Tenant members view BOM" ON public.project_bom_items AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (projects p
     JOIN tenant_memberships tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = project_bom_items.project_id) AND (tm.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Engineers+ can manage folders" ON public.project_folders;
CREATE POLICY "Engineers+ can manage folders" ON public.project_folders AS PERMISSIVE FOR ALL TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Tenant members can view folders" ON public.project_folders;
CREATE POLICY "Tenant members can view folders" ON public.project_folders AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "Engineers+ can delete versions" ON public.project_versions;
CREATE POLICY "Engineers+ can delete versions" ON public.project_versions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_versions.project_id) AND (p.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Engineers+ can insert versions" ON public.project_versions;
CREATE POLICY "Engineers+ can insert versions" ON public.project_versions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = project_versions.project_id) AND (p.tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))));
DROP POLICY IF EXISTS "Tenant members can view versions" ON public.project_versions;
CREATE POLICY "Tenant members can view versions" ON public.project_versions AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_versions.project_id) AND (projects.tenant_id = get_user_tenant_id())))));
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins can delete projects" ON public.projects AS PERMISSIVE FOR DELETE TO public
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Engineers+ can create projects" ON public.projects;
CREATE POLICY "Engineers+ can create projects" ON public.projects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Engineers+ can update projects" ON public.projects;
CREATE POLICY "Engineers+ can update projects" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = ANY (ARRAY['admin'::text, 'engineer'::text]))));
DROP POLICY IF EXISTS "Tenant members can view projects" ON public.projects;
CREATE POLICY "Tenant members can view projects" ON public.projects AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "Users insert own runtime_logs" ON public.runtime_logs;
CREATE POLICY "Users insert own runtime_logs" ON public.runtime_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users view own runtime_logs" ON public.runtime_logs;
CREATE POLICY "Users view own runtime_logs" ON public.runtime_logs AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can delete simulation tags in accessible projects" ON public.simulation_tags;
CREATE POLICY "Users can delete simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can insert simulation tags in accessible projects" ON public.simulation_tags;
CREATE POLICY "Users can insert simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can read simulation tags in accessible projects" ON public.simulation_tags;
CREATE POLICY "Users can read simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can update simulation tags in accessible projects" ON public.simulation_tags;
CREATE POLICY "Users can update simulation tags in accessible projects" ON public.simulation_tags AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulation_tags.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can create simulations in their projects" ON public.simulations;
CREATE POLICY "Users can create simulations in their projects" ON public.simulations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid()))))))))));
DROP POLICY IF EXISTS "Users can delete simulations in their projects" ON public.simulations;
CREATE POLICY "Users can delete simulations in their projects" ON public.simulations AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can update simulations in their projects" ON public.simulations;
CREATE POLICY "Users can update simulations in their projects" ON public.simulations AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can view simulations in their projects" ON public.simulations;
CREATE POLICY "Users can view simulations in their projects" ON public.simulations AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = simulations.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "No client access stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "No client access stripe_webhook_events" ON public.stripe_webhook_events AS PERMISSIVE FOR ALL TO public
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS subscription_audit_log_select_own ON public.subscription_audit_log;
CREATE POLICY subscription_audit_log_select_own ON public.subscription_audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can view subscription" ON public.subscriptions;
CREATE POLICY "Admins can view subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "tenant admins read subscriptions" ON public.subscriptions;
CREATE POLICY "tenant admins read subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = subscriptions.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));
DROP POLICY IF EXISTS "Authenticated users can read builtin templates" ON public.system_templates;
CREATE POLICY "Authenticated users can read builtin templates" ON public.system_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((is_builtin = true) OR (created_by = auth.uid())));
DROP POLICY IF EXISTS "Users can delete own templates" ON public.system_templates;
CREATE POLICY "Users can delete own templates" ON public.system_templates AS PERMISSIVE FOR DELETE TO authenticated
  USING (((created_by = auth.uid()) AND (is_builtin = false)));
DROP POLICY IF EXISTS "Users can insert templates in their tenant" ON public.system_templates;
CREATE POLICY "Users can insert templates in their tenant" ON public.system_templates AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) AND (tenant_id = get_user_tenant_id())));
DROP POLICY IF EXISTS "Users can update own templates" ON public.system_templates;
CREATE POLICY "Users can update own templates" ON public.system_templates AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((created_by = auth.uid()) AND (is_builtin = false)))
  WITH CHECK (((created_by = auth.uid()) AND (is_builtin = false)));
DROP POLICY IF EXISTS "Users can insert tag samples in accessible projects" ON public.tag_samples;
CREATE POLICY "Users can insert tag samples in accessible projects" ON public.tag_samples AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = tag_samples.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can read tag samples in accessible projects" ON public.tag_samples;
CREATE POLICY "Users can read tag samples in accessible projects" ON public.tag_samples AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = tag_samples.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS _no_client_writes ON public.tag_samples_2026_04;
CREATE POLICY _no_client_writes ON public.tag_samples_2026_04 AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS tag_samples_2026_04_select_members ON public.tag_samples_2026_04;
CREATE POLICY tag_samples_2026_04_select_members ON public.tag_samples_2026_04 AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM projects pr
  WHERE ((pr.id = tag_samples_2026_04.project_id) AND ((pr.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = pr.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS _no_client_writes ON public.tag_samples_2026_05;
CREATE POLICY _no_client_writes ON public.tag_samples_2026_05 AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS tag_samples_2026_05_select_members ON public.tag_samples_2026_05;
CREATE POLICY tag_samples_2026_05_select_members ON public.tag_samples_2026_05 AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM projects pr
  WHERE ((pr.id = tag_samples_2026_05.project_id) AND ((pr.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = pr.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Admins can manage memberships" ON public.tenant_memberships;
CREATE POLICY "Admins can manage memberships" ON public.tenant_memberships AS PERMISSIVE FOR ALL TO authenticated
  USING (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)))
  WITH CHECK (((tenant_id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Members can view own tenant memberships" ON public.tenant_memberships;
CREATE POLICY "Members can view own tenant memberships" ON public.tenant_memberships AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "admins can delete tenant settings" ON public.tenant_settings;
CREATE POLICY "admins can delete tenant settings" ON public.tenant_settings AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
DROP POLICY IF EXISTS "admins can insert tenant settings" ON public.tenant_settings;
CREATE POLICY "admins can insert tenant settings" ON public.tenant_settings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
DROP POLICY IF EXISTS "admins can update tenant settings" ON public.tenant_settings;
CREATE POLICY "admins can update tenant settings" ON public.tenant_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
DROP POLICY IF EXISTS "members can read tenant settings" ON public.tenant_settings;
CREATE POLICY "members can read tenant settings" ON public.tenant_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.tenant_id = tenant_settings.tenant_id) AND (tm.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Admins can update tenant" ON public.tenants;
CREATE POLICY "Admins can update tenant" ON public.tenants AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)))
  WITH CHECK (((id = get_user_tenant_id()) AND (get_user_role() = 'admin'::text)));
DROP POLICY IF EXISTS "Users can view own tenant" ON public.tenants;
CREATE POLICY "Users can view own tenant" ON public.tenants AS PERMISSIVE FOR SELECT TO public
  USING ((id = get_user_tenant_id()));
DROP POLICY IF EXISTS "Users can delete trend configs in accessible projects" ON public.trend_configs;
CREATE POLICY "Users can delete trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can insert trend configs in accessible projects" ON public.trend_configs;
CREATE POLICY "Users can insert trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can manage trend configs in accessible projects" ON public.trend_configs;
CREATE POLICY "Users can manage trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Users can update trend configs in accessible projects" ON public.trend_configs;
CREATE POLICY "Users can update trend configs in accessible projects" ON public.trend_configs AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = trend_configs.project_id) AND ((p.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM tenant_memberships tm
          WHERE ((tm.tenant_id = p.tenant_id) AND (tm.user_id = auth.uid())))))))));
DROP POLICY IF EXISTS "Tenant members can view usage" ON public.usage_records;
CREATE POLICY "Tenant members can view usage" ON public.usage_records AS PERMISSIVE FOR SELECT TO public
  USING ((tenant_id = get_user_tenant_id()));
DROP POLICY IF EXISTS "Users can create FB templates in their tenant" ON public.user_function_block_templates;
CREATE POLICY "Users can create FB templates in their tenant" ON public.user_function_block_templates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_memberships tm
  WHERE (tm.user_id = auth.uid()))) AND (created_by = auth.uid())));
DROP POLICY IF EXISTS "Users can delete own FB templates" ON public.user_function_block_templates;
CREATE POLICY "Users can delete own FB templates" ON public.user_function_block_templates AS PERMISSIVE FOR DELETE TO public
  USING ((created_by = auth.uid()));
DROP POLICY IF EXISTS "Users can read public or own tenant FB templates" ON public.user_function_block_templates;
CREATE POLICY "Users can read public or own tenant FB templates" ON public.user_function_block_templates AS PERMISSIVE FOR SELECT TO public
  USING (((is_public = true) OR (tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_memberships tm
  WHERE (tm.user_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can update own FB templates" ON public.user_function_block_templates;
CREATE POLICY "Users can update own FB templates" ON public.user_function_block_templates AS PERMISSIVE FOR UPDATE TO public
  USING ((created_by = auth.uid()))
  WITH CHECK ((created_by = auth.uid()));
DROP POLICY IF EXISTS user_subscriptions_select_own ON public.user_subscriptions;
CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.voltai_feedback_votes;
CREATE POLICY "Admins can view all feedback" ON public.voltai_feedback_votes AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM platform_admins
  WHERE (platform_admins.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can insert own feedback" ON public.voltai_feedback_votes;
CREATE POLICY "Users can insert own feedback" ON public.voltai_feedback_votes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own feedback" ON public.voltai_feedback_votes;
CREATE POLICY "Users can view own feedback" ON public.voltai_feedback_votes AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins can view all learning logs" ON public.voltai_learning_logs;
CREATE POLICY "Admins can view all learning logs" ON public.voltai_learning_logs AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM platform_admins
  WHERE (platform_admins.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Users can insert own learning logs" ON public.voltai_learning_logs;
CREATE POLICY "Users can insert own learning logs" ON public.voltai_learning_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can view own learning logs" ON public.voltai_learning_logs;
CREATE POLICY "Users can view own learning logs" ON public.voltai_learning_logs AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
DROP POLICY IF EXISTS "Admins can manage training scenarios" ON public.voltai_training_scenarios;
CREATE POLICY "Admins can manage training scenarios" ON public.voltai_training_scenarios AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins
  WHERE (platform_admins.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM platform_admins
  WHERE (platform_admins.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Platform admins can read training scenarios" ON public.voltai_training_scenarios;
CREATE POLICY "Platform admins can read training scenarios" ON public.voltai_training_scenarios AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = auth.uid()))));
