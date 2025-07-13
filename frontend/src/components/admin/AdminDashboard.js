// Modern Admin Dashboard Component (Vanilla JavaScript)
// Converted from React design to work with existing Smart Port system

export class AdminDashboard {
  constructor(router, authService) {
    this.router = router
    this.authService = authService
    this.activeMenuItem = 'dashboard'
    this.sidebarOpen = false
    this.submenuOpen = {} // เพิ่มสำหรับจัดการ submenu
    
    this.menuItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
      { id: 'probation-end', label: 'พ้นทดลองปฏิบัติราชการ', icon: 'user-check' },
      { 
        id: 'candidates', 
        label: 'Candidate Lists', 
        icon: 'users',
        submenu: [
          { id: 'general', label: 'ทั่วไป', useBullet: true },
          { id: 'academic', label: 'วิชาการ', useBullet: true },
          { id: 'support', label: 'อำนวยการ', useBullet: true },
          { id: 'management', label: 'บริหาร', useBullet: true }
        ]
      },
      { id: 'time-counting', label: 'การนับเวลาเกื้อกูล', icon: 'clock' },
      { id: 'royal-decorations', label: 'เครื่องราชอิสริยาภรณ์', icon: 'award' },
      { id: 'retirement-report', label: 'รายงานผู้เกษียณ', icon: 'user-minus' },
      { id: 'work-management', label: 'การจัดการงาน', icon: 'briefcase' },
      { id: 'work-results', label: 'ผลงานและข้อเสนอ', icon: 'file-text' },
      { id: 'awards', label: 'รางวัล/ความดีความชอบ', icon: 'trophy' }
    ]
    
    this.dashboardStats = [
      { title: 'จำนวนข้าราชการทั้งหมด', value: '2,847', change: '+12%', icon: 'users', color: 'text-blue-600', bgColor: 'bg-blue-50' },
      { title: 'ผู้พ้นทดลองปีนี้', value: '156', change: '+8%', icon: 'user-check', color: 'text-green-600', bgColor: 'bg-green-50' },
      { title: 'Candidate Lists', value: '89', change: '+3%', icon: 'users', color: 'text-orange-600', bgColor: 'bg-orange-50' },
      { title: 'ผู้เกษียณปีนี้', value: '24', change: '+15%', icon: 'user-minus', color: 'text-purple-600', bgColor: 'bg-purple-50' }
    ]
  }

  render() {
    const app = document.getElementById('app')
    app.innerHTML = this.getTemplate()
    this.attachEventListeners()
  }

  getTemplate() {
    return `
      <div class="min-h-screen bg-gray-50 flex">
        <!-- Mobile Sidebar Overlay -->
        <div id="sidebar-overlay" class="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden ${this.sidebarOpen ? '' : 'hidden'}" onclick="window.adminDashboard.toggleSidebar()"></div>

        <!-- Sidebar -->
        <div id="sidebar" class="fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-800 transform transition-transform duration-300 ease-in-out ${this.sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}">
          <div class="flex items-center justify-between h-16 px-6 bg-gray-900">
            <h1 class="text-xl font-bold text-white">ระบบสมุดพก</h1>
            <button onclick="window.adminDashboard.toggleSidebar()" class="lg:hidden text-gray-400 hover:text-white transition-colors">
              <i data-lucide="x" class="w-6 h-6"></i>
            </button>
          </div>
          
          <nav class="mt-8 px-4 space-y-2">
            ${this.menuItems.map(item => `
              <div>
                <button onclick="window.adminDashboard.handleMenuClick('${item.id}')" class="w-full flex items-center px-4 py-3 text-left rounded-lg transition-all duration-200 ${this.activeMenuItem === item.id ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]' : 'text-gray-300 hover:bg-gray-700 hover:text-white hover:transform hover:scale-[1.01]'}">
                  <i data-lucide="${item.icon}" class="w-5 h-5 mr-3"></i>
                  <span class="text-sm font-medium flex-1">${item.label}</span>
                  ${item.submenu ? `<i data-lucide="chevron-${this.submenuOpen[item.id] ? 'down' : 'right'}" class="w-4 h-4"></i>` : ''}
                </button>
                ${item.submenu && this.submenuOpen[item.id] ? `
                  <div class="ml-8 mt-2 space-y-1">
                    ${item.submenu.map(subitem => `
                      <button onclick="window.adminDashboard.handleMenuClick('${subitem.id}')" class="w-full flex items-center px-3 py-2 text-left rounded-lg transition-all duration-200 ${this.activeMenuItem === subitem.id ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white text-xs'}">
                        ${subitem.useBullet ? 
                          `<span class="w-2 h-2 bg-current rounded-full mr-3 opacity-60"></span>` : 
                          `<i data-lucide="${subitem.icon}" class="w-4 h-4 mr-2"></i>`
                        }
                        <span class="text-xs font-medium">${subitem.label}</span>
                      </button>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </nav>

          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="bg-gray-700 rounded-lg p-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <span class="text-white font-medium">A</span>
                </div>
                <div>
                  <p class="text-white text-sm font-medium">ผู้ดูแลระบบ</p>
                  <p class="text-gray-400 text-xs">admin@smartport.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 lg:ml-0">
          <!-- Top Bar -->
          <header class="bg-white shadow-sm border-b border-gray-200 h-16 flex items-center justify-between px-6">
            <div class="flex items-center space-x-4">
              <button onclick="window.adminDashboard.toggleSidebar()" class="lg:hidden text-gray-600 hover:text-gray-900 transition-colors">
                <i data-lucide="menu" class="w-6 h-6"></i>
              </button>
              <div class="flex items-center space-x-2">
                <i data-lucide="home" class="w-5 h-5 text-gray-400"></i>
                <span class="text-gray-400">/</span>
                <span class="text-gray-900 font-medium capitalize">
                  ${this.findCurrentMenuItem()?.label || 'Dashboard'}
                </span>
              </div>
            </div>
            
            <div class="flex items-center space-x-4">
              <div class="relative">
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span class="text-white text-sm font-medium">A</span>
                </div>
                <div class="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
              </div>
              <button onclick="window.adminDashboard.logout()" class="text-red-600 hover:text-red-800 transition-colors">
                <i data-lucide="log-out" class="w-5 h-5"></i>
              </button>
            </div>
          </header>

          <!-- Page Content -->
          <main class="p-6">
            ${this.getPageContent()}
          </main>
        </div>
      </div>
    `
  }

  getPageContent() {
    if (this.activeMenuItem === 'dashboard') {
      return this.getDashboardContent()
    } else {
      return this.getGenericPageContent()
    }
  }

  getDashboardContent() {
    return `
      <div class="space-y-6">
        <!-- Page Header -->
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">ภาพรวมระบบสมุดพก</h1>
            <p class="text-gray-600 mt-1">สรุปข้อมูลสำคัญและกิจกรรมล่าสุดของระบบการจัดการข้าราชการ</p>
          </div>
          <div class="flex items-center space-x-3">
            <button onclick="window.adminDashboard.exportDashboardData()" class="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>ส่งออกรายงาน</span>
            </button>
            <button onclick="window.adminDashboard.refreshDashboard()" class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i>
              <span>รีเฟรช</span>
            </button>
          </div>
        </div>

        <!-- Statistics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          ${this.dashboardStats.map(stat => `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
              <div class="flex items-center">
                <div class="flex-shrink-0">
                  <div class="${stat.bgColor} rounded-lg p-3">
                    <i data-lucide="${stat.icon}" class="w-6 h-6 ${stat.color}"></i>
                  </div>
                </div>
                <div class="ml-4 flex-1">
                  <p class="text-sm font-medium text-gray-600">${stat.title}</p>
                  <p class="text-2xl font-semibold text-gray-900 mt-1">${stat.value}</p>
                  <p class="text-sm mt-1 ${stat.change.startsWith('+') ? 'text-green-600' : stat.change.startsWith('-') ? 'text-red-600' : 'text-gray-600'}">
                    ${stat.change} จากเดือนที่แล้ว
                  </p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- Priority Tasks -->
          <div class="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
            <div class="p-6 border-b border-gray-200">
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">งานสำคัญที่ต้องติดตาม</h2>
                <i data-lucide="alert-circle" class="w-5 h-5 text-orange-500"></i>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รายการ</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จำนวน</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ความสำคัญ</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  ${this.getPriorityTasks().map(task => `
                    <tr class="hover:bg-gray-50 transition-colors">
                      <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center space-x-3">
                          <i data-lucide="${task.icon}" class="w-5 h-5 ${task.iconColor}"></i>
                          <span class="text-sm font-medium text-gray-900">${task.title}</span>
                        </div>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="text-sm text-gray-900">${task.count}</span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${task.priorityColor}">
                          ${task.priority}
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <button onclick="window.adminDashboard.handleMenuClick('${task.route}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          ดูรายละเอียด
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Quick Actions & Recent Activity -->
          <div class="space-y-6">
            <!-- Quick Actions -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900">การดำเนินการด่วน</h3>
                <i data-lucide="zap" class="w-5 h-5 text-yellow-500"></i>
              </div>
              <div class="space-y-3">
                ${this.getQuickActions().map(action => `
                  <button onclick="window.adminDashboard.handleMenuClick('${action.route}')" class="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                    <div class="${action.color} text-white p-2 rounded-lg">
                      <i data-lucide="${action.icon}" class="w-4 h-4"></i>
                    </div>
                    <span class="text-sm font-medium text-gray-700">${action.title}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900">กิจกรรมล่าสุด</h3>
                <i data-lucide="activity" class="w-5 h-5 text-blue-500"></i>
              </div>
              <div class="space-y-3">
                ${this.getRecentActivities().map(activity => `
                  <div class="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div class="w-2 h-2 rounded-full mt-2 ${activity.type === 'success' ? 'bg-green-500' : activity.type === 'warning' ? 'bg-orange-500' : 'bg-blue-500'}"></div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gray-900">${activity.action}</p>
                      <p class="text-xs text-gray-500 mt-1">${activity.time}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- System Status -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-900">สถานะระบบ</h2>
            <div class="flex items-center space-x-2">
              <div class="w-2 h-2 bg-green-500 rounded-full"></div>
              <span class="text-sm text-gray-600">ปกติ</span>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            ${this.getSystemStatus().map(status => `
              <div class="text-center p-4 rounded-lg ${status.bgColor}">
                <i data-lucide="${status.icon}" class="w-6 h-6 ${status.color} mx-auto mb-2"></i>
                <p class="text-sm font-medium ${status.textColor}">${status.label}</p>
                <p class="text-xs ${status.textColor} opacity-75">${status.value}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `
  }

  getGenericPageContent() {
    const currentItem = this.findCurrentMenuItem()
    return `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div class="max-w-md mx-auto">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i data-lucide="${currentItem?.icon || 'file'}" class="w-8 h-8 text-gray-600"></i>
          </div>
          <h2 class="text-xl font-semibold text-gray-900 mb-2">
            ${currentItem?.label || 'หน้าไม่พบ'}
          </h2>
          <p class="text-gray-600 mb-4">
            ส่วนนี้อยู่ระหว่างการพัฒนา เนื้อหาสำหรับโมดูลนี้จะพร้อมใช้งานเร็วๆ นี้
          </p>
          <button onclick="window.adminDashboard.handleMenuClick('dashboard')" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i data-lucide="arrow-left" class="w-4 h-4 mr-2"></i>
            กลับไปที่ Dashboard
          </button>
        </div>
      </div>
    `
  }

  findCurrentMenuItem() {
    // ค้นหาใน main menu
    let item = this.menuItems.find(item => item.id === this.activeMenuItem)
    if (item) return item
    
    // ค้นหาใน submenu
    for (const mainItem of this.menuItems) {
      if (mainItem.submenu) {
        const subItem = mainItem.submenu.find(sub => sub.id === this.activeMenuItem)
        if (subItem) return subItem
      }
    }
    return null
  }

  getRecentActivities() {
    return [
      { action: 'มีผู้สมัครพ้นทดลองปฏิบัติราชการ', time: '2 นาทีที่แล้ว', type: 'success' },
      { action: 'อัพเดตข้อมูลเครื่องราชอิสริยาภรณ์', time: '1 ชั่วโมงที่แล้ว', type: 'info' },
      { action: 'รายงานผู้เกษียณรอการตรวจสอบ', time: '3 ชั่วโมงที่แล้ว', type: 'warning' },
      { action: 'สร้างรายงานการนับเวลาเกื้อกูล', time: '1 วันที่แล้ว', type: 'success' }
    ]
  }

  getQuickActions() {
    return [
      { title: 'พ้นทดลองปฏิบัติราชการ', icon: 'user-check', color: 'bg-blue-500', route: 'probation-end' },
      { title: 'เลื่อนระดับตำแหน่ง', icon: 'trending-up', color: 'bg-green-500', route: 'level-promotion' },
      { title: 'รายงานผู้เกษียณ', icon: 'user-minus', color: 'bg-purple-500', route: 'retirement-report' },
      { title: 'เครื่องราชอิสริยาภรณ์', icon: 'award', color: 'bg-orange-500', route: 'royal-decorations' }
    ]
  }

  getPriorityTasks() {
    return [
      {
        title: 'ข้าราชการครบกำหนดพ้นทดลอง',
        count: '12 คน',
        priority: 'เร่งด่วน',
        priorityColor: 'bg-red-100 text-red-800',
        icon: 'user-check',
        iconColor: 'text-red-500',
        route: 'probation-end'
      },
      {
        title: 'รายชื่อผู้มีสิทธิ์เลื่อนตำแหน่ง',
        count: '28 คน',
        priority: 'สำคัญ',
        priorityColor: 'bg-orange-100 text-orange-800',
        icon: 'trending-up',
        iconColor: 'text-orange-500',
        route: 'general'
      },
      {
        title: 'ข้าราชการใกล้เกษียณ (6 เดือน)',
        count: '15 คน',
        priority: 'ปกติ',
        priorityColor: 'bg-blue-100 text-blue-800',
        icon: 'user-minus',
        iconColor: 'text-blue-500',
        route: 'retirement-report'
      },
      {
        title: 'เครื่องราชอิสริยาภรณ์รอดำเนินการ',
        count: '7 คน',
        priority: 'ปกติ',
        priorityColor: 'bg-green-100 text-green-800',
        icon: 'award',
        iconColor: 'text-green-500',
        route: 'royal-decorations'
      }
    ]
  }

  getSystemStatus() {
    return [
      {
        label: 'ฐานข้อมูล',
        value: 'ออนไลน์',
        icon: 'database',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        textColor: 'text-green-700'
      },
      {
        label: 'ระบบสำรอง',
        value: 'พร้อมใช้งาน',
        icon: 'shield-check',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-700'
      },
      {
        label: 'ผู้ใช้ออนไลน์',
        value: '23 คน',
        icon: 'users',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-700'
      },
      {
        label: 'อัพเดทล่าสุด',
        value: '2 ชม. ที่แล้ว',
        icon: 'clock',
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        textColor: 'text-gray-700'
      }
    ]
  }

  exportDashboardData() {
    console.log('Exporting dashboard data...')
    // In real app, this would generate and download a report
    alert('กำลังส่งออกรายงานภาพรวมระบบ...')
  }

  refreshDashboard() {
    console.log('Refreshing dashboard...')
    // In real app, this would refresh data from server
    // Re-render the dashboard content
    const main = document.querySelector('main')
    if (main) {
      main.innerHTML = this.getPageContent()
      this.initializeLucideIcons()
    }
    
    // Show success message
    setTimeout(() => {
      alert('อัพเดทข้อมูลเรียบร้อยแล้ว')
    }, 500)
  }

  attachEventListeners() {
    // Initialize Lucide icons
    this.initializeLucideIcons()
    
    // Make dashboard globally available
    window.adminDashboard = this
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen
    const sidebar = document.getElementById('sidebar')
    const overlay = document.getElementById('sidebar-overlay')
    
    if (this.sidebarOpen) {
      sidebar.classList.remove('-translate-x-full')
      overlay.classList.remove('hidden')
    } else {
      sidebar.classList.add('-translate-x-full')
      overlay.classList.add('hidden')
    }
  }

  handleMenuClick(itemId) {
    // ตรวจสอบว่าเป็น main menu ที่มี submenu หรือไม่
    const mainItem = this.menuItems.find(item => item.id === itemId)
    if (mainItem && mainItem.submenu) {
      // Toggle submenu
      this.submenuOpen[itemId] = !this.submenuOpen[itemId]
      // Re-render sidebar only
      this.renderSidebar()
      return
    }
    
    // ตรวจสอบว่าเป็น submenu item หรือไม่
    let routePath = null
    if (itemId === 'general') {
      routePath = '/candidates/general'
    } else if (itemId === 'academic') {
      routePath = '/candidates/academic'
    } else if (itemId === 'support') {
      routePath = '/candidates/support'
    } else if (itemId === 'management') {
      routePath = '/candidates/management'
    } else if (itemId === 'probation-end') {
      routePath = '/probation-end'
    }
    
    // ถ้าเป็น submenu item หรือ probation-end ให้ navigate ไปยัง route ใหม่
    if (routePath) {
      this.activeMenuItem = itemId
      this.sidebarOpen = false
      
      // Navigate to appropriate page
      if (this.router) {
        this.router.navigate(routePath)
      }
      
      // Close sidebar on mobile
      const sidebar = document.getElementById('sidebar')
      const overlay = document.getElementById('sidebar-overlay')
      if (sidebar && overlay) {
        sidebar.classList.add('-translate-x-full')
        overlay.classList.add('hidden')
      }
      return
    }
    
    this.activeMenuItem = itemId
    this.sidebarOpen = false
    
    // Re-render the page content for other menu items
    const main = document.querySelector('main')
    if (main) {
      main.innerHTML = this.getPageContent()
    }
    
    // Update navigation
    this.updateNavigation()
    
    // Re-initialize icons for new content
    this.initializeLucideIcons()
    
    // Update URL without page reload for other items
    if (this.router) {
      if (itemId === 'dashboard') {
        this.router.navigate('/dashboard', false) // false = don't trigger page load
      } else {
        this.router.navigate(`/${itemId}`, false)
      }
    }
    
    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar')
    const overlay = document.getElementById('sidebar-overlay')
    if (sidebar && overlay) {
      sidebar.classList.add('-translate-x-full')
      overlay.classList.add('hidden')
    }
  }

  renderSidebar() {
    const nav = document.querySelector('nav')
    if (nav) {
      nav.innerHTML = `
        ${this.menuItems.map(item => `
          <div>
            <button onclick="window.adminDashboard.handleMenuClick('${item.id}')" class="w-full flex items-center px-4 py-3 text-left rounded-lg transition-all duration-200 ${this.activeMenuItem === item.id ? 'bg-blue-600 text-white shadow-lg transform scale-[1.02]' : 'text-gray-300 hover:bg-gray-700 hover:text-white hover:transform hover:scale-[1.01]'}">
              <i data-lucide="${item.icon}" class="w-5 h-5 mr-3"></i>
              <span class="text-sm font-medium flex-1">${item.label}</span>
              ${item.submenu ? `<i data-lucide="chevron-${this.submenuOpen[item.id] ? 'down' : 'right'}" class="w-4 h-4"></i>` : ''}
            </button>
            ${item.submenu && this.submenuOpen[item.id] ? `
              <div class="ml-8 mt-2 space-y-1">
                ${item.submenu.map(subitem => `
                  <button onclick="window.adminDashboard.handleMenuClick('${subitem.id}')" class="w-full flex items-center px-3 py-2 text-left rounded-lg transition-all duration-200 ${this.activeMenuItem === subitem.id ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white text-xs'}">
                    <i data-lucide="${subitem.icon}" class="w-4 h-4 mr-2"></i>
                    <span class="text-xs font-medium">${subitem.label}</span>
                  </button>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      `
      // Re-initialize icons
      this.initializeLucideIcons()
    }
  }

  updateNavigation() {
    // Update breadcrumb
    const breadcrumb = document.querySelector('header span.capitalize')
    if (breadcrumb) {
      const currentItem = this.findCurrentMenuItem()
      breadcrumb.textContent = currentItem?.label || 'Dashboard'
    }
    
    // Re-render sidebar to update active states
    this.renderSidebar()
  }

  logout() {
    if (this.authService) {
      this.authService.logout()
      if (this.router) {
        this.router.navigate('/login')
      }
    }
  }

  initializeLucideIcons() {
    // Initialize Lucide icons if available
    if (window.lucide) {
      window.lucide.createIcons()
    } else {
      // Fallback to load Lucide if not already loaded
      this.loadLucideIcons()
    }
  }

  loadLucideIcons() {
    // Check if already loading or loaded
    if (window.lucideLoading || window.lucide) return
    
    window.lucideLoading = true
    
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/lucide@latest/dist/umd/lucide.js'
    script.onload = () => {
      window.lucideLoading = false
      if (window.lucide) {
        window.lucide.createIcons()
      }
    }
    document.head.appendChild(script)
  }
}