-- ============================================================================
-- 30-photo-blob-storage.sql
-- Issue #112: เก็บ bytes ของรูปในฐานข้อมูลแทน filesystem ของ container
-- (filesystem ของ Render ไม่ persist ข้าม deploy — ดู ADR-0001 และ ADR-0003)
--
-- แถวเก่าที่ไฟล์สูญหายไปแล้วจะมี file_data=NULL — serving คืน 404 และ
-- reconciliation คือการอัปโหลดใหม่ (ดู docs/adr/0003-photo-storage-tidb-blob.md)
-- ============================================================================

ALTER TABLE civil_servant_photos
    ADD COLUMN file_data MEDIUMBLOB NULL AFTER file_path,
    ADD COLUMN mime_type VARCHAR(60) NULL AFTER file_data,
    ADD COLUMN file_size INT UNSIGNED NULL AFTER mime_type;
