-- ============================================================
-- 第11章：配置参数调优
-- 业务场景：查看和调整MySQL关键配置参数
-- ============================================================

-- 1. 查看InnoDB缓冲池状态
-- 业务场景：检查缓冲池是否足够大
-- 执行预期：Buffer pool hit rate 应接近100%
SHOW STATUS LIKE 'Innodb_buffer_pool_read%';
-- Innodb_buffer_pool_read_requests：缓冲池读请求次数
-- Innodb_buffer_pool_reads：从磁盘读取的次数
-- 命中率 = 1 - (reads / read_requests)

-- 2. 查看当前配置
-- 业务场景：了解当前MySQL的配置参数
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW VARIABLES LIKE 'innodb_log_file_size';
SHOW VARIABLES LIKE 'max_connections';
SHOW VARIABLES LIKE 'sort_buffer_size';
SHOW VARIABLES LIKE 'join_buffer_size';
SHOW VARIABLES LIKE 'tmp_table_size';

-- 3. 查看连接状态
-- 业务场景：检查连接数是否够用
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';
SHOW VARIABLES LIKE 'max_connections';

-- 4. 查看临时表使用情况
-- 业务场景：检查是否需要增大tmp_table_size
SHOW STATUS LIKE 'Created_tmp%';
-- Created_tmp_disk_tables：在磁盘上创建的临时表数量
-- Created_tmp_tables：创建的临时表总数
-- 磁盘临时表比例 = disk_tables / total_tables，应尽量小

-- 5. 查看排序使用情况
-- 业务场景：检查sort_buffer_size是否够用
SHOW STATUS LIKE 'Sort_merge_passes';
-- Sort_merge_passes：需要合并的排序次数，应尽量小

-- 6. 查看表缓存命中率
-- 业务场景：检查table_open_cache是否够用
SHOW STATUS LIKE 'Open_tables';
SHOW STATUS LIKE 'Opened_tables';
-- 命中率 = 1 - (Opened_tables / Open_tables)，应接近100%

-- ============================================================
-- 配置调优建议
-- ============================================================

-- innodb_buffer_pool_size：物理内存的50%-70%
--   太小：频繁磁盘IO，查询慢
--   太大：操作系统内存不足，可能OOM

-- innodb_flush_log_at_trx_commit：
--   1：最安全，每次提交刷盘（默认）
--   2：每秒刷盘，性能好但可能丢失1秒数据
--   0：不刷盘，性能最好但可能丢失数据

-- sort_buffer_size / join_buffer_size：
--   注意：这些是每个会话分配的，设置太大会导致内存不足
--   建议：256K-512K，除非有特殊需求
