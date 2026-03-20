import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usage_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('license_key_id').nullable().references('id').inTable('license_keys').onDelete('SET NULL');
    table.string('event_type', 50).notNullable();
    table.string('moodle_url', 500).nullable();
    table.jsonb('details').nullable().defaultTo('{}');
    table.string('ip_address', 45).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('organization_id');
    table.index('event_type');
    table.index('created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('usage_logs');
}
