import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subscription_plans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable();
    table.string('slug', 50).notNullable().unique();
    table.text('description').nullable();
    table.integer('price_monthly_cents').notNullable().defaultTo(0);
    table.integer('price_yearly_cents').notNullable().defaultTo(0);
    table.specificType('currency', 'char(3)').notNullable().defaultTo('EUR');
    table.jsonb('limits').notNullable().defaultTo('{}');
    table.jsonb('features').notNullable().defaultTo('{}');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.index('slug');
    table.index('is_active');
  });

  // Seed default plans
  await knex('subscription_plans').insert([
    {
      name: 'Trial',
      slug: 'trial',
      description: 'Essai gratuit 14 jours',
      price_monthly_cents: 0,
      price_yearly_cents: 0,
      currency: 'EUR',
      limits: JSON.stringify({ max_moodle_instances: 1, max_courses_per_month: 5, max_api_calls_per_day: 100, max_users: 1 }),
      features: JSON.stringify({ llm_enabled: false, oer_enabled: false, collaboration: false, priority_support: false }),
      is_active: true,
      sort_order: 0,
    },
    {
      name: 'Starter',
      slug: 'starter',
      description: 'Pour les enseignants individuels',
      price_monthly_cents: 2900,
      price_yearly_cents: 29000,
      currency: 'EUR',
      limits: JSON.stringify({ max_moodle_instances: 1, max_courses_per_month: 20, max_api_calls_per_day: 1000, max_users: 5 }),
      features: JSON.stringify({ llm_enabled: false, oer_enabled: false, collaboration: false, priority_support: false }),
      is_active: true,
      sort_order: 1,
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'Pour les équipes pédagogiques',
      price_monthly_cents: 9900,
      price_yearly_cents: 99000,
      currency: 'EUR',
      limits: JSON.stringify({ max_moodle_instances: 5, max_courses_per_month: 100, max_api_calls_per_day: 10000, max_users: 25 }),
      features: JSON.stringify({ llm_enabled: true, oer_enabled: true, collaboration: true, priority_support: true }),
      is_active: true,
      sort_order: 2,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'Pour les établissements',
      price_monthly_cents: 0,
      price_yearly_cents: 0,
      currency: 'EUR',
      limits: JSON.stringify({ max_moodle_instances: -1, max_courses_per_month: -1, max_api_calls_per_day: -1, max_users: -1 }),
      features: JSON.stringify({ llm_enabled: true, oer_enabled: true, collaboration: true, priority_support: true }),
      is_active: true,
      sort_order: 3,
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('subscription_plans');
}
