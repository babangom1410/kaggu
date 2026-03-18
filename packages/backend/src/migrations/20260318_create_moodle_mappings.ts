import type { Knex } from 'knex';

// Raw SQL for Supabase Studio (if Knex migrations are not used):
//
// CREATE TABLE moodle_mappings (
//   project_id UUID NOT NULL,
//   node_id VARCHAR(100) NOT NULL,
//   moodle_type VARCHAR(10) NOT NULL CHECK (moodle_type IN ('course', 'section', 'module')),
//   moodle_id INTEGER NOT NULL,
//   last_synced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   checksum VARCHAR(64),
//   PRIMARY KEY (project_id, node_id)
// );
// CREATE INDEX moodle_mappings_project_id_idx ON moodle_mappings (project_id);

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('moodle_mappings', (table) => {
    table.uuid('project_id').notNullable();
    table.string('node_id', 100).notNullable();
    table.enu('moodle_type', ['course', 'section', 'module']).notNullable();
    table.integer('moodle_id').notNullable();
    table.timestamp('last_synced', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.string('checksum', 64).nullable();
    table.primary(['project_id', 'node_id']);
    table.index('project_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('moodle_mappings');
}
