<?php
// ตั้งค่า header ให้ตอบกลับเป็น JSON
header('Content-Type: application/json');

// สร้างข้อมูลตอบกลับเป็น array
$response = [
    'status' => 'success',
    'message' => 'Smart Port API is running.'
];

// แปลง array เป็น JSON แล้วแสดงผล
echo json_encode($response);
