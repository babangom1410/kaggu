import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('license_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('subscription_id').notNullable().references('id').inTable('subscriptions').onDelete('CASCADE');
    table.string('key', 40).notNullable().unique();
    table.string('key_hash', 64).notNullable();
    table.enu('status', ['active', 'suspended', 'revoked', 'expired']).notNullable().defaultTo('active');
    table.string('moodle_url', 500).nullable();
    table.string('moodle_site_id', 255).nullable();
    table.timestamp('activated_at').nullable();
    table.timestamp('last_validated_at').nullable();
    table.timestamp('expires_at').nullable();
    table.jsonb('metadata').nullable().defaultTo('{}');
    table.timestamps(true, true);

    table.index('key_hash');
    table.index('organization_id');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('license_keys');
}
