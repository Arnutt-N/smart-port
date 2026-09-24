-- ============================================================================
-- 33-drop-photo-versions-and-dead-views.sql
-- ลบ residue ที่ยืนยันแล้วว่าไม่มี consumer ใน backend/frontend (findings M2):
--   - photo_versions (legacy จาก 02 — live code ไม่ query เหลือแค่เทสที่กำลังจะแก้)
--   - vw_job_series_tenure, vw_executive_tenure (จาก 04 — zero reference ในโค้ด)
--
-- ความจริง 3 ข้อที่ต้องจำ:
--   (ก) photo_versions ไม่มีใน database/tidb-init.sql อยู่แล้ว (no-op ฝั่งนั้น)
--   (ข) 2 views คงอยู่ใน tidb-init.sql ต่อไปโดยตั้งใจ — INV-1 บังคับว่าของที่ NN
--       migration (04) สร้างต้องอยู่ใน tidb-init และ gate ไม่มี drop-awareness
--       (objectsCreatedBy อ่านแต่ CREATE) — ห้ามลบ views ออกจาก tidb-init
--       (จะทำ INV-1 แดง); precedent: screening_list โดน 24 drop แต่ tidb-init
--       ยังเก็บ — divergence นี้ยอมรับแล้วสำหรับ dead objects ที่ไม่มี consumer
--   (ค) DROP ... IF EXISTS ทั้งหมด — rerun ปลอดภัย (idempotent)
-- ============================================================================

DROP TABLE IF EXISTS photo_versions;
DROP VIEW IF EXISTS vw_job_series_tenure;
DROP VIEW IF EXISTS vw_executive_tenure;
