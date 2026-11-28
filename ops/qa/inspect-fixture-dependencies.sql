\set ON_ERROR_STOP on
BEGIN READ ONLY;
-- Report direct ID references, including non-FK columns, without reading PII.
-- Includes new rows created during testing which reference a seeded record.
SELECT format('SELECT %L AS table_name, %L AS field_name, count(*) AS matching_rows FROM %I.%I WHERE %I LIKE %L HAVING count(*) > 0;',table_name,column_name,table_schema,table_name,column_name,'qa27-%')
FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying') AND (column_name='id' OR column_name LIKE '%Id' OR column_name IN ('createdBy','requestedBy','approvedBy','checkedInBy','decidedBy')) ORDER BY table_name,column_name
\gexec
-- Reference inspection is not a deletion manifest: recursively inspect dependent rows,
-- JSON references, file uploads, cross-account relations and financial/audit history.
ROLLBACK;
