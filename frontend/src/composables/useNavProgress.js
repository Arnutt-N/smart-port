import { ref } from 'vue'

// state ระดับ module (ไม่ใช้ Pinia) เพราะ router ต้อง set ค่าได้ก่อน app/pinia ถูก mount
const isNavigating = ref(false)

export function useNavProgress() {
  return { isNavigating }
}
