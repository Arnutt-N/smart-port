-- A2 smoke (tidb-init-bootstrap): seed ต้องมีแถวจริง — INSERT ใน tidb-init.sql ต้องรันจริง
-- ไม่ใช่แค่ DDL ผ่าน · ไฟล์เดียวใช้ร่วมกันทั้ง ci.yml job `tidb-init-bootstrap` และ
-- step `tidb-init.sql Bootstrap Smoke` ใน ci-local.sh/.ps1 (กัน 3 สำเนาเพี้ยนกันเอง)
--
-- output (ส่งผ่าน `docker exec -i ... mysql --batch --skip-column-names < ไฟล์นี้`):
--   6 แถวแรก = (tbl, n) ต่อตาราง เพื่อ log วินิจฉัย
--   แถวสุดท้าย = จำนวนตาราง seed ที่ "ว่าง" — caller ต้อง assert เป็น 0 เสมอ (fail-closed)
--   ถ้าตารางใดไม่มีอยู่เลย statement จะ error → stdout ไม่มีแถวสุดท้าย = 0 ก็ถือว่า fail เช่นกัน
SELECT 'personnel' AS tbl, COUNT(*) AS n FROM personnel
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'organization', COUNT(*) FROM organization
UNION ALL SELECT 'position', COUNT(*) FROM position
UNION ALL SELECT 'promotion_criteria', COUNT(*) FROM promotion_criteria
UNION ALL SELECT 'probation_program', COUNT(*) FROM probation_program;
SELECT SUM(zero_rows) AS empty_tables FROM (
  SELECT (COUNT(*) = 0) AS zero_rows FROM personnel
  UNION ALL SELECT (COUNT(*) = 0) FROM users
  UNION ALL SELECT (COUNT(*) = 0) FROM organization
  UNION ALL SELECT (COUNT(*) = 0) FROM position
  UNION ALL SELECT (COUNT(*) = 0) FROM promotion_criteria
  UNION ALL SELECT (COUNT(*) = 0) FROM probation_program
) t;
