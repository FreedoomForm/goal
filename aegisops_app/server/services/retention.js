/**
 * AegisOps — Data Retention & Cleanup Service
 * Periodically purges old data based on retention policy.
 * Uses the data_retention_days setting (default: 365).
 */
const cron = require('node-cron');
const { queryOne, cleanupOldData } = require('../db/pg');
const { eventBus, TOPICS } = require('../events/kafka');
const { log } = require('../middleware/logger');

let _retentionJob = null;

/**
 * Start the data retention cleanup job.
 * Runs daily at 03:00 AM.
 */
function startRetentionJob() {
  if (_retentionJob) return; // Already running

  _retentionJob = cron.schedule('0 3 * * *', async () => {
    try {
      const setting = await queryOne("SELECT value FROM settings WHERE key = 'data_retention_days'");
      const retentionDays = parseInt(setting?.value || '365');

      log.info('retention.starting', { retentionDays });
      const result = await cleanupOldData(retentionDays);

      // Publish audit event
      await eventBus.produce(TOPICS.AUDIT, {
        type: 'data_retention_cleanup',
        retentionDays,
        rows_cleaned: result.cleaned,
        timestamp: new Date().toISOString(),
      });

      log.info('retention.complete', { retentionDays, cleaned: result.cleaned });
    } catch (err) {
      log.error('retention.error', { error: err.message });
    }
  }, { scheduled: true });

  log.info('retention.job_started', { schedule: '0 3 * * *' });
}

function stopRetentionJob() {
  if (_retentionJob) {
    _retentionJob.stop();
    _retentionJob = null;
    log.info('retention.job_stopped');
  }
}

module.exports = { startRetentionJob, stopRetentionJob };
