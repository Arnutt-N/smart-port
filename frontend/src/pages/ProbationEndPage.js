// Probation End Page Component - หน้าพ้นทดลองปฏิบัติราชการ
export class ProbationEndPage {
  constructor(router, authService) {
    this.router = router
    this.authService = authService
    this.searchTerm = ''
    this.showAddModal = false
    this.showEditModal = false
    this.selectedEmployee = null
    
    // Mock data สำหรับพ้นทดลองปฏิบัติราชการ
    this.mockEmployees = [
      {
        id: '1',
        name: 'นายธนากร ขยันดี',
        position: 'นักวิชาการคอมพิวเตอร์',
        department: 'กองเทคโนโลยีสารสนเทศ',
        startDate: '2023-03-15',
        endDate: '2024-03-15',
        remainingDays: 15,
        status: 'upcoming',
        supervisor: 'นายสมชาย หัวหน้า',
        evaluation: 'pending'
      },
      {
        id: '2',
        name: 'นางสาวปรียา ใจซื่อ',
        position: 'เจ้าหน้าที่บริหารงานทั่วไป',
        department: 'กองบริหารงานทั่วไป',
        startDate: '2023-01-10',
        endDate: '2024-01-10',
        remainingDays: 0,
        status: 'ready',
        supervisor: 'นางสาวมาลี ผู้จัดการ',
        evaluation: 'excellent'
      },
      {
        id: '3',
        name: 'นายสุรชัย มานะการ',
        position: 'นักวิชาการเงินและบัญชี',
        department: 'กองการเงินและบัญชี',
        startDate: '2022-12-01',
        endDate: '2023-12-01',
        remainingDays: -45,
        status: 'overdue',
        supervisor: 'นายวิชัย นักบัญชี',
        evaluation: 'good'
      },
      {
        id: '4',
        name: 'นางสาววิไล ตั้งใจ',
        position: 'นักทรัพยากรบุคคล',
        department: 'กองการเจ้าหน้าที่',
        startDate: '2023-06-01',
        endDate: '2024-06-01',
        remainingDays: 75,
        status: 'upcoming',
        supervisor: 'นายธีระ หัวหน้าฝ่าย',
        evaluation: 'pending'
      },
      {
        id: '5',
        name: 'นายกิตติ รักงาน',
        position: 'นักวิเคราะห์นโยบายและแผน',
        department: 'กองแผนงานและงบประมาณ',
        startDate: '2023-04-20',
        endDate: '2024-04-20',
        remainingDays: 42,
        status: 'upcoming',
        supervisor: 'นางสุดา นักวิเคราะห์',
        evaluation: 'good'
      }
    ]
  }

  render() {
    console.log('🔄 Rendering Probation End Page...')
    
    // ถ้ายังไม่มี sidebar ให้สร้างก่อน
    if (!document.getElementById('sidebar')) {
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
        const mainDiv = document.createElement('main')
        mainDiv.className = 'flex-1 lg:ml-64 transition-all duration-300'
        mainDiv.innerHTML = this.getMainContent()
        app.appendChild(mainDiv)
      } else {
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
          <h1 class="text-lg font-semibold text-gray-900">พ้นทดลองปฏิบัติราชการ</h1>
          <div class="w-10"></div>
        </div>
      </div>

      <!-- Page Content -->
      <div class="p-6">
        <div class="space-y-6">
          ${this.getPageHeader()}
          ${this.getStatsCards()}
          ${this.getProbationContent()}
        </div>
      </div>
    `
  }

  getPageHeader() {
    return `
      <!-- Header -->
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">รายชื่อข้าราชการพ้นทดลองปฏิบัติราชการ</h1>
          <p class="text-gray-600 mt-1">จัดการข้อมูลข้าราชการที่ครบกำหนดการทดลองปฏิบัติราชการและติดตามสถานะการประเมิน</p>
        </div>
        <div class="flex items-center space-x-3">
          <button onclick="window.probationEndPage.exportData()" class="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span>ส่งออก</span>
          </button>
          <button onclick="window.probationEndPage.importData()" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i data-lucide="upload" class="w-4 h-4"></i>
            <span>นำเข้า</span>
          </button>
          <button onclick="window.probationEndPage.showAddModal = true; window.probationEndPage.updateModals()" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>เพิ่มรายชื่อ</span>
          </button>
        </div>
      </div>
    `
  }

  getStatsCards() {
    const readyCount = this.mockEmployees.filter(emp => emp.status === 'ready').length
    const upcomingCount = this.mockEmployees.filter(emp => emp.status === 'upcoming').length
    const overdueCount = this.mockEmployees.filter(emp => emp.status === 'overdue').length
    const totalCount = this.mockEmployees.length

    return `
      <!-- Statistics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <i data-lucide="users" class="w-5 h-5 text-blue-600"></i>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">ทั้งหมด</p>
              <p class="text-2xl font-semibold text-gray-900">${totalCount}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">ครบกำหนด</p>
              <p class="text-2xl font-semibold text-gray-900">${readyCount}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                <i data-lucide="clock" class="w-5 h-5 text-yellow-600"></i>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">ใกล้ครบกำหนด</p>
              <p class="text-2xl font-semibold text-gray-900">${upcomingCount}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <div class="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <i data-lucide="alert-triangle" class="w-5 h-5 text-red-600"></i>
              </div>
            </div>
            <div class="ml-4">
              <p class="text-sm font-medium text-gray-600">เกินกำหนด</p>
              <p class="text-2xl font-semibold text-gray-900">${overdueCount}</p>
            </div>
          </div>
        </div>
      </div>
    `
  }
  getProbationContent() {
    return `
      <!-- Main Content Card -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200">
        
        <!-- Search and Filter -->
        <div class="p-6 border-b border-gray-200">
          <div class="flex flex-col sm:flex-row gap-4">
            <div class="flex-1 relative">
              <i data-lucide="search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5"></i>
              <input
                type="text"
                placeholder="ค้นหาชื่อ หรือตำแหน่ง..."
                value="${this.searchTerm}"
                onkeyup="window.probationEndPage.updateSearch(this.value)"
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button onclick="window.probationEndPage.showFilter()" class="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <i data-lucide="filter" class="w-4 h-4"></i>
              <span>ตัวกรอง</span>
            </button>
          </div>
        </div>

        <!-- Table -->
        ${this.getEmployeesTable()}

        <!-- Pagination -->
        <div class="px-6 py-4 border-t border-gray-200">
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700">
              แสดง <span class="font-medium">1</span> ถึง <span class="font-medium">${this.getFilteredEmployees().length}</span> จาก <span class="font-medium">${this.getFilteredEmployees().length}</span> รายการ
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

  getFilteredEmployees() {
    return this.mockEmployees.filter(employee => {
      if (this.searchTerm) {
        const searchLower = this.searchTerm.toLowerCase()
        return employee.name.toLowerCase().includes(searchLower) || 
               employee.position.toLowerCase().includes(searchLower) ||
               employee.department.toLowerCase().includes(searchLower)
      }
      return true
    })
  }

  getEmployeesTable() {
    return `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ชื่อ-นามสกุล
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ตำแหน่ง / หน่วยงาน
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                วันที่เริ่มทดลองงาน
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
            ${this.getFilteredEmployees().map(employee => `
              <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">${employee.name}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">${employee.position}</div>
                  <div class="text-sm text-gray-500">${employee.department}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <i data-lucide="calendar" class="w-4 h-4 text-gray-400"></i>
                    <span class="text-sm text-gray-900">${employee.startDate}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <i data-lucide="calendar-check" class="w-4 h-4 text-gray-400"></i>
                    <span class="text-sm text-gray-900">${employee.endDate}</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium ${
                    employee.remainingDays < 0 ? 'text-red-600' : 
                    employee.remainingDays === 0 ? 'text-green-600' :
                    employee.remainingDays < 30 ? 'text-yellow-600' : 'text-blue-600'
                  }">
                    ${employee.remainingDays < 0 ? `เกิน ${Math.abs(employee.remainingDays)} วัน` : 
                      employee.remainingDays === 0 ? 'ครบกำหนดวันนี้' :
                      `${employee.remainingDays} วัน`}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    ${this.getStatusIcon(employee.status)}
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${this.getStatusColor(employee.status)}">
                      ${this.getStatusText(employee.status)}
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2">
                    <button
                      onclick="window.probationEndPage.handleView('${employee.id}')"
                      class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="ดูรายละเอียด"
                    >
                      <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                    <button
                      onclick="window.probationEndPage.handleEdit('${employee.id}')"
                      class="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="แก้ไข"
                    >
                      <i data-lucide="edit" class="w-4 h-4"></i>
                    </button>
                    <button
                      onclick="window.probationEndPage.handleComplete('${employee.id}')"
                      class="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="ดำเนินการพ้นทดลอง"
                    >
                      <i data-lucide="check-circle" class="w-4 h-4"></i>
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
            <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onclick="window.probationEndPage.showAddModal = false; window.probationEndPage.updateModals()"></div>
            <div class="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <h3 class="text-lg font-medium text-gray-900 mb-4">เพิ่มข้าราชการทดลองงาน</h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                  <input type="text" id="add-name" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ตำแหน่ง</label>
                  <input type="text" id="add-position" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">หน่วยงาน</label>
                  <input type="text" id="add-department" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มทดลองงาน</label>
                  <input type="date" id="add-start-date" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">ผู้ควบคุม</label>
                  <input type="text" id="add-supervisor" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
              <div class="flex justify-end space-x-3 mt-6">
                <button
                  onclick="window.probationEndPage.showAddModal = false; window.probationEndPage.updateModals()"
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button onclick="window.probationEndPage.saveEmployee()" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
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
      case 'ready':
        return '<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i>';
      case 'upcoming':
        return '<i data-lucide="clock" class="w-5 h-5 text-yellow-500"></i>';
      case 'overdue':
        return '<i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>';
      default:
        return '<i data-lucide="alert-circle" class="w-5 h-5 text-gray-500"></i>';
    }
  }

  getStatusText(status) {
    switch (status) {
      case 'ready':
        return 'พร้อมพ้นทดลอง';
      case 'upcoming':
        return 'ใกล้ครบกำหนด';
      case 'overdue':
        return 'เกินกำหนด';
      default:
        return 'ไม่ระบุ';
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'ready':
        return 'bg-green-100 text-green-800';
      case 'upcoming':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  // Event handlers
  updateSearch(value) {
    this.searchTerm = value
    // In real app, this would filter the employees
    console.log('Search term:', value)
  }

  showFilter() {
    console.log('Show filter modal')
  }

  exportData() {
    console.log('Export probation end data')
    // In real app, this would export data to Excel/CSV
  }

  importData() {
    console.log('Import probation end data')
    // In real app, this would show import modal
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

  handleView(employeeId) {
    const employee = this.mockEmployees.find(emp => emp.id === employeeId)
    console.log('View employee:', employee)
    // In real app, this would show employee details modal
  }

  handleEdit(employeeId) {
    const employee = this.mockEmployees.find(emp => emp.id === employeeId)
    this.selectedEmployee = employee
    console.log('Edit employee:', employee)
    // In real app, this would show edit modal
  }

  handleComplete(employeeId) {
    const employee = this.mockEmployees.find(emp => emp.id === employeeId)
    if (confirm(`คุณต้องการดำเนินการพ้นทดลองให้กับ ${employee.name} หรือไม่?`)) {
      console.log('Complete probation for:', employee)
      // In real app, this would call API to complete probation
    }
  }

  saveEmployee() {
    const name = document.getElementById('add-name').value
    const position = document.getElementById('add-position').value
    const department = document.getElementById('add-department').value
    const startDate = document.getElementById('add-start-date').value
    const supervisor = document.getElementById('add-supervisor').value
    
    console.log('Save employee:', { name, position, department, startDate, supervisor })
    
    // In real app, this would call API to save
    this.showAddModal = false
    this.updateModals()
  }

  attachEventListeners() {
    // Any additional event listeners can be added here
    console.log('Probation End Page event listeners attached')
  }
}
