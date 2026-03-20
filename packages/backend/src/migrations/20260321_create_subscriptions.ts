import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('plan_id').notNullable().references('id').inTable('subscription_plans').onDelete('RESTRICT');
    table.enu('status', ['trialing', 'active', 'past_due', 'canceled', 'expired']).notNullable().defaultTo('trialing');
    table.timestamp('current_period_start').notNullable();
    table.timestamp('current_period_end').notNullable();
    table.timestamp('trial_ends_at').nullable();
    table.timestamp('canceled_at').nullable();
    table.string('payment_provider', 50).nullable();
    table.string('payment_provider_id', 255).nullable();
    table.timestamps(true, true);

    table.index('organization_id');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('subscriptions');
}
