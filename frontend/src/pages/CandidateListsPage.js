// Candidate Lists Page Component - Converted from React to Vanilla JS
export class CandidateListsPage {
  constructor(router, authService) {
    this.router = router
    this.authService = authService
    this.activeSection = 'general'
    this.activeLevel = 'ชำนาญงาน'
    this.searchTerm = ''
    this.showAddModal = false
    this.showEditModal = false
    this.selectedCandidate = null
    
    // Mock data - in real app, this would come from API
    this.mockCandidates = [
      {
        id: '1',
        name: 'นายสมชาย ใจดี',
        currentPosition: 'นักวิชาการคอมพิวเตอร์',
        currentLevel: 'ปฏิบัติการ',
        dueDate: '2024-03-15',
        remainingDays: 45,
        status: 'eligible'
      },
      {
        id: '2',
        name: 'นางสาวมาลี สวยงาม',
        currentPosition: 'เจ้าหน้าที่บริหารงานทั่วไป',
        currentLevel: 'ปฏิบัติการ',
        dueDate: '2024-02-28',
        remainingDays: 28,
        status: 'pending'
      },
      {
        id: '3',
        name: 'นายวิชัย เก่งมาก',
        currentPosition: 'นักวิชาการเงินและบัญชี',
        currentLevel: 'ชำนาญการ',
        dueDate: '2024-01-30',
        remainingDays: -5,
        status: 'overdue'
      }
    ]
    
    this.sections = [
      {
        id: 'general',
        title: 'ทั่วไป',
        levels: ['ชำนาญงาน', 'อาวุโส']
      },
      {
        id: 'academic',
        title: 'วิชาการ',
        levels: ['ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ', 'ทรงคุณวุฒิ']
      },
      {
        id: 'administrative',
        title: 'อำนวยการ',
        levels: ['ต้น', 'สูง']
      },
      {
        id: 'management',
        title: 'บริหาร',
        levels: ['ต้น', 'สูง']
      }
    ]
  }

  render() {
    // ใช้ adminDashboard.render() เพื่อไม่ทำลาย sidebar
    // แล้วแทนที่เฉพาะ main content
    console.log('🔄 Rendering Candidate Lists Page...')
    
    // ถ้ายังไม่มี sidebar ให้สร้างก่อน
    if (!document.getElementById('sidebar')) {
      // ใช้ AdminDashboard เพื่อสร้าง sidebar
      if (window.adminDashboard) {
        window.adminDashboard.render()
      }
    }
    
    // แทนที่เฉพาะ main content
    const mainContent = document.querySelector('main') || document.getElementById('main-content')
    if (mainContent) {
      mainContent.innerHTML = this.getMainContent()
    } else {
      // สร้าง main content ใหม่ถ้าไม่มี
      const app = document.getElementById('app')
      const existingSidebar = document.getElementById('sidebar')
      
      if (existingSidebar) {
        // มี sidebar แล้ว เพิ่มเฉพาะ main content
        const mainDiv = document.createElement('main')
        mainDiv.className = 'flex-1 lg:ml-64 transition-all duration-300'
        mainDiv.innerHTML = this.getMainContent()
        app.appendChild(mainDiv)
      } else {
        // ยังไม่มี sidebar ให้สร้างทั้งหมด
        app.innerHTML = this.getTemplate()
      }
    }
    
    this.attachEventListeners()
    
    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons()
    }
  }

  getTemplate() {
    return `
      <div class="min-h-screen bg-gray-50 flex">
        <!-- Include existing sidebar (this will be populated by AdminDashboard) -->
        <div id="existing-sidebar"></div>
        
        <!-- Main Content -->
        <main class="flex-1 lg:ml-64 transition-all duration-300">
          ${this.getMainContent()}
        </main>
        
        <!-- Modals -->
        ${this.getModals()}
      </div>
    `
  }

  getMainContent() {
    return `
      <!-- Mobile Header -->
      <div class="lg:hidden bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div class="flex items-center justify-between">
          <button onclick="window.adminDashboard.toggleSidebar()" class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <i data-lucide="menu" class="w-6 h-6"></i>
          </button>
          <h1 class="text-lg font-semibold text-gray-900">รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง</h1>
          <div class="w-10"></div>
        </div>
      </div>

      <!-- Page Content -->
      <div class="p-6">
        <div class="space-y-6">
          ${this.getPageHeader()}
          ${this.getCandidateListContent()}
        </div>
      </div>
    `
  }

  getPageHeader() {
    // กำหนดชื่อหน้าตามประเภท
    const sectionTitles = {
      'general': 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (ทั่วไป)',
      'academic': 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (วิชาการ)',
      'administrative': 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (อำนวยการ)',
      'management': 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง (บริหาร)'
    }

    const pageTitle = sectionTitles[this.activeSection] || 'รายชื่อผู้มีคุณสมบัติเลื่อน/ย้ายตำแหน่ง'
    
    return `
      <!-- Header -->
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">${pageTitle}</h1>
          <p class="text-gray-600 mt-1">จัดการข้อมูลผู้มีคุณสมบัติเลื่อนและย้ายตำแหน่งในสายงาน${this.getSectionDescription()}</p>
        </div>
        <div class="flex items-center space-x-3">
          <button onclick="window.candidateListsPage.exportData()" class="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span>ส่งออก</span>
          </button>
          <button onclick="window.candidateListsPage.importData()" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i data-lucide="upload" class="w-4 h-4"></i>
            <span>นำเข้า</span>
          </button>
          <button onclick="window.candidateListsPage.showAddModal = true; window.candidateListsPage.updateModals()" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>เพิ่มรายชื่อ</span>
          </button>
        </div>
      </div>
    `
  }

  getSectionDescription() {
    const descriptions = {
      'general': 'ทั่วไป',
      'academic': 'วิชาการ',
      'administrative': 'อำนวยการ',
      'management': 'บริหาร'
    }
    return descriptions[this.activeSection] || ''
  }

  getCandidateListContent() {
    const currentSection = this.sections.find(s => s.id === this.activeSection)
    
    return `
      <!-- Main Content Card (ไม่มี Section Tabs) -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        
        <!-- Level Sub-tabs (ถ้ามี) -->
        ${currentSection && currentSection.levels && currentSection.levels.length > 1 ? `
          <div class="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div class="flex flex-wrap gap-2">
              ${currentSection.levels.map(level => `
                <button
                  onclick="window.candidateListsPage.setActiveLevel('${level}')"
                  class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    this.activeLevel === level
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }"
                >
                  ${level}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Search and Filter -->
        <div class="p-6 border-b border-gray-200">
          <div class="flex flex-col sm:flex-row gap-4">
            <div class="flex-1 relative">
              <i data-lucide="search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"></i>
              <input
                type="text"
                placeholder="ค้นหาชื่อ หรือตำแหน่ง..."
                value="${this.searchTerm}"
                onkeyup="window.candidateListsPage.updateSearch(this.value)"
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button onclick="window.candidateListsPage.showFilter()" class="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <i data-lucide="filter" class="w-4 h-4"></i>
              <span>ตัวกรอง</span>
            </button>
          </div>
        </div>

        <!-- Table -->
        ${this.getCandidatesTable()}

        <!-- Pagination -->
        <div class="px-6 py-4 border-t border-gray-200">
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700">
              แสดง <span class="font-medium">1</span> ถึง <span class="font-medium">${this.getFilteredCandidates().length}</span> จาก <span class="font-medium">${this.getFilteredCandidates().length}</span> รายการ
            </div>
            <div class="flex items-center space-x-2">
              <button class="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                ก่อนหน้า
              </button>
              <button class="px-3 py-1 bg-blue-600 text-white rounded-md text-sm">
                1
              </button>
              <button class="px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-500 hover:bg-gray-50 transition-colors">
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  getFilteredCandidates() {
    // กรองข้อมูลตาม activeSection (ในระบบจริงจะดึงจาก API)
    return this.mockCandidates.filter(candidate => {
      // กรองตาม search term ถ้ามี
      if (this.searchTerm) {
        const searchLower = this.searchTerm.toLowerCase()
        return candidate.name.toLowerCase().includes(searchLower) || 
               candidate.currentPosition.toLowerCase().includes(searchLower)
      }
      return true
    })
  }

  getCandidatesTable() {
    return `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ชื่อ-นามสกุล
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ตำแหน่งปัจจุบัน
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ระดับตำแหน่ง
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                วันที่ครบกำหนด
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                จำนวนวันที่เหลือ
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                สถานะ
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                การดำเนินการ
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${this.getFilteredCandidates().map(candidate => `
              <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">${candidate.name}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">${candidate.currentPosition}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">${candidate.currentLevel}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <i data-lucide="calendar" class="w-4 h-4 text-gray-400"></i>
                    <span class="text-sm text-gray-900">${candidate.dueDate}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium ${
                    candidate.remainingDays < 0 ? 'text-red-600' : 
                    candidate.remainingDays < 30 ? 'text-yellow-600' : 'text-green-600'
                  }">
                    ${candidate.remainingDays < 0 ? `เกิน ${Math.abs(candidate.remainingDays)} วัน` : `${candidate.remainingDays} วัน`}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    ${this.getStatusIcon(candidate.status)}
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${this.getStatusColor(candidate.status)}">
                      ${this.getStatusText(candidate.status)}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <button
                      onclick="window.candidateListsPage.handleView('${candidate.id}')"
                      class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="ดูรายละเอียด"
                    >
                      <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                    <button
                      onclick="window.candidateListsPage.handleEdit('${candidate.id}')"
                      class="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="แก้ไข"
                    >
                      <i data-lucide="edit" class="w-4 h-4"></i>
                    </button>
                    <button
                      onclick="window.candidateListsPage.handleDelete('${candidate.id}')"
                      class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="ลบ"
                    >
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  getModals() {
    return `
      <!-- Add Modal -->
      ${this.showAddModal ? `
        <div class="fixed inset-0 z-50 overflow-y-auto">
          <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onclick="window.candidateListsPage.showAddModal = false; window.candidateListsPage.updateModals()"></div>
            <div class="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <h3 class="text-lg font-medium text-gray-900 mb-4">เพิ่มรายชื่อผู้มีสิทธิ์</h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                  <input type="text" id="add-name" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ตำแหน่งปัจจุบัน</label>
                  <input type="text" id="add-position" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ระดับตำแหน่ง</label>
                  <select id="add-level" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option>เลือกระดับตำแหน่ง</option>
                    <option>ปฏิบัติการ</option>
                    <option>ชำนาญการ</option>
                    <option>เชี่ยวชาญ</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">วันที่ครบกำหนด</label>
                  <input type="date" id="add-date" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
              <div class="flex justify-end space-x-3 mt-6">
                <button
                  onclick="window.candidateListsPage.showAddModal = false; window.candidateListsPage.updateModals()"
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button onclick="window.candidateListsPage.saveCandidate()" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    `
  }

  // Status helper methods
  getStatusIcon(status) {
    switch (status) {
      case 'eligible':
        return '<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i>';
      case 'pending':
        return '<i data-lucide="clock" class="w-5 h-5 text-yellow-500"></i>';
      case 'overdue':
        return '<i data-lucide="x-circle" class="w-5 h-5 text-red-500"></i>';
      default:
        return '<i data-lucide="alert-circle" class="w-5 h-5 text-gray-500"></i>';
    }
  }

  getStatusText(status) {
    switch (status) {
      case 'eligible':
        return 'ครบกำหนด';
      case 'pending':
        return 'รอดำเนินการ';
      case 'overdue':
        return 'เกินกำหนด';
      default:
        return 'ไม่ระบุ';
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'eligible':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  // Event handlers
  setActiveLevel(level) {
    this.activeLevel = level
    // Re-render เฉพาะ main content
    const mainContent = document.querySelector('main') || document.getElementById('main-content')
    if (mainContent) {
      mainContent.innerHTML = this.getMainContent()
      if (window.lucide) {
        window.lucide.createIcons()
      }
    }
  }

  updateSearch(value) {
    this.searchTerm = value
    // In real app, this would filter the candidates
    console.log('Search term:', value)
  }

  showFilter() {
    console.log('Show filter modal')
  }

  exportData() {
    console.log('Export data')
  }

  importData() {
    console.log('Import data')
  }

  updateModals() {
    // Re-render only the modals part
    const existingModal = document.querySelector('.fixed.inset-0.z-50')
    if (existingModal) {
      existingModal.remove()
    }
    
    if (this.showAddModal) {
      document.body.insertAdjacentHTML('beforeend', this.getModals())
      if (window.lucide) {
        window.lucide.createIcons()
      }
    }
  }

  handleView(candidateId) {
    const candidate = this.mockCandidates.find(c => c.id === candidateId)
    console.log('View candidate:', candidate)
  }

  handleEdit(candidateId) {
    const candidate = this.mockCandidates.find(c => c.id === candidateId)
    this.selectedCandidate = candidate
    console.log('Edit candidate:', candidate)
  }

  handleDelete(candidateId) {
    if (confirm('คุณต้องการลบข้อมูลนี้หรือไม่?')) {
      console.log('Delete candidate:', candidateId)
      // In real app, this would call API to delete
    }
  }

  saveCandidate() {
    const name = document.getElementById('add-name').value
    const position = document.getElementById('add-position').value
    const level = document.getElementById('add-level').value
    const date = document.getElementById('add-date').value
    
    console.log('Save candidate:', { name, position, level, date })
    
    // In real app, this would call API to save
    this.showAddModal = false
    this.updateModals()
  }

  attachEventListeners() {
    // Any additional event listeners can be added here
    console.log('Candidate Lists Page event listeners attached')
  }
}
