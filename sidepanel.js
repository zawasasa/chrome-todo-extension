// Helper function to get local date string without timezone issues
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

class TaskManager {
  constructor() {
    this.tasks = []
    this.completedTasks = {}
    this.todayOnlyTasks = {}
    this.postponedTasks = {}
    this.activityLog = []
    this.currentCalendarDate = new Date()
    this.selectedDate = null
    this.calendarVisible = false
    this.init()
  }

  async init() {
    // サイドパネルが開いたことを記録
    await chrome.storage.local.set({ sidePanelOpen: true });

    await this.loadData()
    this.setupEventListeners()
    this.updateDisplay()
    this.startPeriodicUpdate()
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(['tasks', 'completedTasks', 'todayOnlyTasks', 'postponedTasks', 'activityLog'])
      this.tasks = result.tasks || []
      this.completedTasks = result.completedTasks || {}
      this.todayOnlyTasks = result.todayOnlyTasks || {}
      this.postponedTasks = result.postponedTasks || {}
      this.activityLog = result.activityLog || []
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error)
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        tasks: this.tasks,
        completedTasks: this.completedTasks,
        todayOnlyTasks: this.todayOnlyTasks,
        postponedTasks: this.postponedTasks,
        activityLog: this.activityLog
      })
    } catch (error) {
      console.error('データの保存に失敗しました:', error)
    }
  }

  addActivityLog(action, taskName, details = null) {
    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      action: action,
      taskName: taskName,
      details: details
    }

    this.activityLog.push(logEntry)

    // ログが1000件を超えたら古いものを削除
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000)
    }
  }

  setupEventListeners() {
    document.getElementById('settings-btn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })
    })

    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.updateDisplay()
    })


    // Today only todo functionality
    document.getElementById('add-today-todo-btn').addEventListener('click', () => {
      this.addTodayOnlyTask()
    })

    document.getElementById('today-todo-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addTodayOnlyTask()
      }
    })

    // Postpone functionality
    document.getElementById('postpone-all-btn').addEventListener('click', () => {
      this.postponeIncompleteTasks()
    })

    document.getElementById('mark-done-btn').addEventListener('click', () => {
      this.markDayComplete()
    })

    // Calendar functionality
    document.getElementById('calendar-btn').addEventListener('click', () => {
      this.toggleCalendar()
    })

    document.getElementById('prev-month').addEventListener('click', () => {
      this.navigateMonth(-1)
    })

    document.getElementById('next-month').addEventListener('click', () => {
      this.navigateMonth(1)
    })

    // Future todo functionality
    document.getElementById('add-future-todo-btn').addEventListener('click', () => {
      this.addFutureTodoFromCalendar()
    })

    document.getElementById('future-todo-text').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addFutureTodoFromCalendar()
      }
    })

    document.getElementById('add-future-task-btn').addEventListener('click', () => {
      this.addFutureTodoFromForm()
    })

    document.getElementById('future-task-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addFutureTodoFromForm()
      }
    })

    // Set minimum date for date picker to today
    const today = getLocalDateString()
    document.getElementById('future-task-date').setAttribute('min', today)
  }

  isWeekday() {
    const today = new Date()
    const dayOfWeek = today.getDay()
    return dayOfWeek >= 1 && dayOfWeek <= 5 // 月曜日(1)から金曜日(5)
  }

  getTodayString() {
    const today = new Date()
    return getLocalDateString(today)
  }

  getNextDayString() {
    const today = new Date()
    const nextDay = new Date(today)
    nextDay.setDate(nextDay.getDate() + 1)
    return getLocalDateString(nextDay)
  }

  getNextWeekdayString() {
    const today = new Date()
    let nextDay = new Date(today)

    do {
      nextDay.setDate(nextDay.getDate() + 1)
    } while (nextDay.getDay() === 0 || nextDay.getDay() === 6) // Skip weekends

    return getLocalDateString(nextDay)
  }

  getTodayTasks() {
    const todayString = this.getTodayString()

    // Get routine tasks (only on weekdays)
    let routineTasks = []
    if (this.isWeekday()) {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const dayOfMonth = today.getDate()
      const isLastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() === dayOfMonth

      routineTasks = this.tasks.filter(task => {
        switch (task.type) {
          case 'daily':
            return true
          case 'weekly':
            return task.days.includes(dayOfWeek)
          case 'monthly':
            if (task.day === 'last') {
              return isLastDayOfMonth
            }
            return task.day === dayOfMonth
          default:
            return false
        }
      })
    }

    // Get today only tasks (available every day)
    const todayOnly = this.todayOnlyTasks[todayString] || []
    const todayOnlyTaskObjects = todayOnly.map(task => ({
      ...task,
      type: 'today-only'
    }))

    // Get postponed tasks for today (available every day)
    const postponed = this.postponedTasks[todayString] || []
    const postponedTaskObjects = postponed.map(task => ({
      ...task,
      type: 'postponed'
    }))

    return [...routineTasks, ...todayOnlyTaskObjects, ...postponedTaskObjects]
  }

  async addTodayOnlyTask() {
    const input = document.getElementById('today-todo-input')
    const text = input.value.trim()

    if (text === '') {
      return
    }

    const todayString = this.getTodayString()
    const task = {
      id: Date.now(),
      name: text,
      createdAt: new Date().toISOString()
    }

    if (!this.todayOnlyTasks[todayString]) {
      this.todayOnlyTasks[todayString] = []
    }

    this.todayOnlyTasks[todayString].push(task)
    this.addActivityLog('added', text)
    input.value = ''
    await this.saveData()
    this.updateDisplay()
  }

  async toggleTask(taskId, taskType = null) {
    const todayString = this.getTodayString()

    if (!this.completedTasks[todayString]) {
      this.completedTasks[todayString] = {}
    }

    const wasCompleted = this.completedTasks[todayString][taskId] || false
    this.completedTasks[todayString][taskId] = !wasCompleted

    // ログ記録用にタスク名を取得
    const taskName = this.getTaskNameById(taskId, taskType)
    if (taskName) {
      this.addActivityLog(wasCompleted ? 'uncompleted' : 'completed', taskName)
    }

    await this.saveData()
    this.updateDisplay()
  }

  async deleteTodayOnlyTask(taskId) {
    const todayString = this.getTodayString()

    // ログ記録用にタスク名を取得（削除前に）
    const taskName = this.getTaskNameById(taskId, 'today-only')

    // Delete from today-only tasks
    if (this.todayOnlyTasks[todayString]) {
      this.todayOnlyTasks[todayString] = this.todayOnlyTasks[todayString].filter(task => task.id !== taskId)
    }

    // Delete from postponed tasks
    if (this.postponedTasks[todayString]) {
      this.postponedTasks[todayString] = this.postponedTasks[todayString].filter(task => task.id !== taskId)
    }

    if (taskName) {
      this.addActivityLog('deleted', taskName)
    }

    await this.saveData()
    this.updateDisplay()
  }

  async postponeIncompleteTasks() {
    const todayString = this.getTodayString()
    // Use next day for weekends, next weekday for weekdays
    const nextDayString = this.isWeekday() ? this.getNextWeekdayString() : this.getNextDayString()
    const todayTasks = this.getTodayTasks()

    const incompleteTasks = todayTasks.filter(task => !this.isTaskCompleted(task.id))

    if (incompleteTasks.length === 0) {
      this.hidePosponeSection()
      return
    }

    if (!this.postponedTasks[nextDayString]) {
      this.postponedTasks[nextDayString] = []
    }

    // Add incomplete tasks to next day's postponed list
    incompleteTasks.forEach(task => {
      // Only postpone today-only and already postponed tasks
      if (task.type === 'today-only' || task.type === 'postponed') {
        const postponedTask = {
          id: Date.now() + Math.random(), // New unique ID
          name: task.name,
          originalDate: task.originalDate || todayString, // Keep original date if already postponed
          originalType: task.originalType || task.type,
          postponedFrom: todayString // Track immediate previous date
        }
        this.postponedTasks[nextDayString].push(postponedTask)
        this.addActivityLog('postponed', task.name)
      }
    })

    // Clean up today's today-only tasks (remove incomplete ones)
    if (this.todayOnlyTasks[todayString]) {
      this.todayOnlyTasks[todayString] = this.todayOnlyTasks[todayString].filter(task =>
        this.isTaskCompleted(task.id)
      )
    }

    // Clean up today's postponed tasks (remove incomplete ones)
    if (this.postponedTasks[todayString]) {
      this.postponedTasks[todayString] = this.postponedTasks[todayString].filter(task =>
        this.isTaskCompleted(task.id)
      )
    }

    await this.saveData()
    this.hidePosponeSection()
    this.updateDisplay()
    this.showSuccessMessage('未完了のタスクを明日に送りました')
  }

  async markDayComplete() {
    this.hidePosponeSection()
    this.showSuccessMessage('今日のタスクを完了としました')
  }

  isTaskCompleted(taskId) {
    const todayString = this.getTodayString()
    return this.completedTasks[todayString]?.[taskId] || false
  }

  updateDisplay() {
    this.updateDateDisplay()
    this.updateTodayTodoTitle()
    this.showTaskList()
    this.checkForIncompleteTasksAtEndOfDay()
    this.checkForWeekendIncompleteTasks()
    this.updateProgressDisplay()
  }

  updateTodayTodoTitle() {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    const titleElement = document.getElementById('today-todo-title')
    if (isWeekend) {
      titleElement.textContent = '今日のToDo'
    } else {
      titleElement.textContent = '今日だけのToDo'
    }
  }

  updateDateDisplay() {
    const today = new Date()
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }
    document.getElementById('current-date').textContent =
      today.toLocaleDateString('ja-JP', options)
  }

  showTaskList() {
    document.getElementById('task-container').style.display = 'block'

    const todayTasks = this.getTodayTasks()
    const taskList = document.getElementById('task-list')
    const noTasksMessage = document.getElementById('no-tasks')

    if (todayTasks.length === 0) {
      noTasksMessage.style.display = 'block'
      taskList.innerHTML = ''
      return
    }

    noTasksMessage.style.display = 'none'
    this.renderTasks(todayTasks)
  }

  renderTasks(tasks) {
    const taskList = document.getElementById('task-list')
    taskList.innerHTML = ''

    tasks.forEach(task => {
      const li = document.createElement('li')
      li.className = 'task-item'

      const isCompleted = this.isTaskCompleted(task.id)
      if (isCompleted) {
        li.classList.add('completed')
      }

      const typeLabel = this.getTypeLabel(task.type)
      const deleteButton = (task.type === 'today-only' || task.type === 'future' || task.type === 'past' || task.type === 'postponed') ?
        `<button class="delete-btn" data-task-id="${task.id}" title="削除">×</button>` : ''

      // Add original date info for postponed tasks
      const originalDateInfo = this.getOriginalDateInfo(task)

      li.innerHTML = `
        <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''}
               data-task-id="${task.id}">
        <span class="task-text ${isCompleted ? 'completed' : ''}">
          ${this.escapeHtml(task.name)}
          ${originalDateInfo}
        </span>
        <span class="task-type ${task.type}">${typeLabel}</span>
        ${deleteButton}
      `

      const checkbox = li.querySelector('.task-checkbox')
      checkbox.addEventListener('change', () => {
        this.toggleTask(task.id, task.type)
      })

      const deleteBtn = li.querySelector('.delete-btn')
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (task.type === 'today-only' || task.type === 'future' || task.type === 'past' || task.type === 'postponed') {
            this.deleteTodayOnlyTask(task.id)
          }
        })
      }

      taskList.appendChild(li)
    })
  }

  getTypeLabel(type) {
    switch (type) {
      case 'daily':
        return '毎日'
      case 'weekly':
        return '毎週'
      case 'monthly':
        return '毎月'
      case 'today-only':
        return '今日のみ'
      case 'future':
        return '予定'
      case 'past':
        return '過去'
      case 'postponed':
        return '延期'
      default:
        return ''
    }
  }

  getOriginalDateInfo(task) {
    if (task.type !== 'postponed' || !task.originalDate) {
      return ''
    }

    const today = new Date()
    const originalDate = new Date(task.originalDate + 'T00:00:00')
    const todayString = getLocalDateString(today)

    // Calculate days difference
    const diffTime = today.getTime() - originalDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    let dateText = ''
    if (diffDays === 1) {
      dateText = '昨日から'
    } else if (diffDays > 1) {
      dateText = `${diffDays}日前から`
    } else {
      // Same day or future date, show actual date
      const options = { month: 'numeric', day: 'numeric' }
      const formattedDate = originalDate.toLocaleDateString('ja-JP', options)
      dateText = `(${formattedDate})`
    }

    return `<span class="original-date">${dateText}</span>`
  }

  checkForIncompleteTasksAtEndOfDay() {
    const now = new Date()
    const hours = now.getHours()

    // Show postpone section after 5 PM (17:00) if there are incomplete tasks
    if (hours >= 17) {
      const todayTasks = this.getTodayTasks()
      const incompleteTasks = todayTasks.filter(task => !this.isTaskCompleted(task.id))

      if (incompleteTasks.length > 0) {
        this.showPosponeSection()
      } else {
        this.hidePosponeSection()
      }
    } else {
      this.hidePosponeSection()
    }
  }

  showPosponeSection() {
    document.getElementById('postpone-section').style.display = 'block'
  }

  hidePosponeSection() {
    document.getElementById('postpone-section').style.display = 'none'
  }

  // Weekend incomplete tasks functionality
  getWeekendIncompleteTasks() {
    const today = new Date()
    const todayString = getLocalDateString(today)
    const weekendTasks = []

    // Check up to 30 days back for weekend incomplete tasks
    for (let i = 1; i <= 30; i++) {
      const checkDate = new Date(today)
      checkDate.setDate(checkDate.getDate() - i)
      const dayOfWeek = checkDate.getDay()

      // Check if it's weekend (Saturday or Sunday)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        const dateString = getLocalDateString(checkDate)
        const tasksForDate = this.getTasksForDate(dateString)

        if (tasksForDate.length > 0) {
          // Check if there are incomplete tasks
          const incompleteTasks = tasksForDate.filter(task => {
            const completedForDate = this.completedTasks[dateString]
            return !completedForDate || !completedForDate[task.id]
          })

          if (incompleteTasks.length > 0) {
            weekendTasks.push({
              date: checkDate,
              dateString: dateString,
              tasks: incompleteTasks
            })
          }
        }
      }
    }

    return weekendTasks.reverse() // Show oldest first
  }

  checkForWeekendIncompleteTasks() {
    const today = new Date()
    const dayOfWeek = today.getDay()

    // Only show on weekdays (Monday to Friday)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const weekendTasks = this.getWeekendIncompleteTasks()

      if (weekendTasks.length > 0) {
        this.showWeekendWarningSection(weekendTasks)
      } else {
        this.hideWeekendWarningSection()
      }
    } else {
      this.hideWeekendWarningSection()
    }
  }

  showWeekendWarningSection(weekendTasks) {
    const section = document.getElementById('weekend-warning-section')
    const tasksList = document.getElementById('weekend-tasks-list')

    tasksList.innerHTML = ''

    weekendTasks.forEach(({ date, dateString, tasks }) => {
      const dayOfWeek = date.getDay()
      const dayName = dayOfWeek === 0 ? '日' : '土'
      const options = { month: 'numeric', day: 'numeric' }
      const formattedDate = date.toLocaleDateString('ja-JP', options)

      const groupDiv = document.createElement('div')
      groupDiv.className = 'weekend-task-group'

      const dateDiv = document.createElement('div')
      dateDiv.className = 'weekend-task-date'
      dateDiv.textContent = `${formattedDate}(${dayName})`
      groupDiv.appendChild(dateDiv)

      tasks.forEach(task => {
        const taskDiv = document.createElement('div')
        taskDiv.className = 'weekend-task-item'
        taskDiv.textContent = task.name
        groupDiv.appendChild(taskDiv)
      })

      tasksList.appendChild(groupDiv)
    })

    section.style.display = 'block'
  }

  hideWeekendWarningSection() {
    document.getElementById('weekend-warning-section').style.display = 'none'
  }

  hasIncompleteTasks(dateString) {
    const tasksForDate = this.getTasksForDate(dateString)
    if (tasksForDate.length === 0) {
      return false
    }

    const completedForDate = this.completedTasks[dateString]
    const incompleteTasks = tasksForDate.filter(task => {
      return !completedForDate || !completedForDate[task.id]
    })

    return incompleteTasks.length > 0
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  startPeriodicUpdate() {
    // 1分ごとに表示を更新（日付変更を検知）
    setInterval(() => {
      this.updateDisplay()
    }, 60000)
  }

  updateProgressDisplay() {
    const todayTasks = this.getTodayTasks()
    const progressElement = document.getElementById('progress-display')

    if (todayTasks.length === 0) {
      progressElement.textContent = ''
      return
    }

    const completedCount = todayTasks.filter(task => this.isTaskCompleted(task.id)).length
    const progressText = `${completedCount}/${todayTasks.length} 完了`
    progressElement.textContent = progressText
  }

  showSuccessMessage(message) {
    const existingMessage = document.querySelector('.success-message')
    if (existingMessage) {
      existingMessage.remove()
    }

    const messageEl = document.createElement('div')
    messageEl.className = 'success-message'
    messageEl.textContent = message
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `

    document.body.appendChild(messageEl)

    setTimeout(() => {
      messageEl.remove()
    }, 3000)
  }

  // Calendar functionality
  toggleCalendar() {
    this.calendarVisible = !this.calendarVisible
    const calendarEl = document.getElementById('mini-calendar')
    const taskContainer = document.getElementById('task-container')

    if (this.calendarVisible) {
      calendarEl.style.display = 'block'
      taskContainer.style.display = 'none'
      this.renderCalendar()
    } else {
      calendarEl.style.display = 'none'
      taskContainer.style.display = 'block'
    }
  }

  navigateMonth(direction) {
    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + direction)
    this.renderCalendar()
  }

  renderCalendar() {
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    const year = this.currentCalendarDate.getFullYear()
    const month = this.currentCalendarDate.getMonth()

    // Update month/year display
    document.getElementById('calendar-month-year').textContent = `${year}年 ${monthNames[month]}`

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDay = firstDay.getDay()

    // Clear previous dates
    const datesContainer = document.getElementById('calendar-dates')
    datesContainer.innerHTML = ''

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDay; i++) {
      const emptyDay = document.createElement('div')
      emptyDay.className = 'calendar-day empty'
      datesContainer.appendChild(emptyDay)
    }

    // Add days of the month
    const today = new Date()
    const todayString = getLocalDateString(today)

    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = document.createElement('div')
      // Fix: Construct date string manually to avoid timezone issues
      const dayString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

      dayEl.className = 'calendar-day'
      dayEl.textContent = day

      // Highlight today
      if (dayString === todayString) {
        dayEl.classList.add('today')
      }

      // Check if this day has tasks
      if (this.getTasksForDate(dayString).length > 0) {
        dayEl.classList.add('has-tasks')
      }

      // Check if this day has incomplete tasks (past dates only)
      if (dayString < todayString && this.hasIncompleteTasks(dayString)) {
        dayEl.classList.add('has-incomplete-tasks')
      }

      // Add click handler
      dayEl.addEventListener('click', () => {
        this.selectDate(dayString, dayEl)
      })

      datesContainer.appendChild(dayEl)
    }
  }

  selectDate(dateString, dayEl) {
    // Remove previous selection
    document.querySelectorAll('.calendar-day.selected').forEach(el => {
      el.classList.remove('selected')
    })

    // Add selection to clicked day
    dayEl.classList.add('selected')
    this.selectedDate = dateString

    // Show/hide future todo input based on date
    const today = getLocalDateString()
    const futureInputEl = document.getElementById('future-todo-input')

    if (dateString >= today) {
      futureInputEl.style.display = 'block'
    } else {
      futureInputEl.style.display = 'none'
    }

    // Update preview
    this.updateDatePreview(dateString)
  }

  getTasksForDate(dateString) {
    const date = new Date(dateString + 'T00:00:00')
    const dayOfWeek = date.getDay()
    const dayOfMonth = date.getDate()
    const isLastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === dayOfMonth
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5

    const todayString = getLocalDateString()
    let tasks = []

    // Get routine tasks (only on weekdays)
    if (isWeekday) {
      const routineTasks = this.tasks.filter(task => {
        switch (task.type) {
          case 'daily':
            return true
          case 'weekly':
            return task.days.includes(dayOfWeek)
          case 'monthly':
            if (task.day === 'last') {
              return isLastDayOfMonth
            }
            return task.day === dayOfMonth
          default:
            return false
        }
      })
      tasks = [...tasks, ...routineTasks]
    }

    // Get today-only tasks for this date
    const todayOnly = this.todayOnlyTasks[dateString] || []
    const todayOnlyTaskObjects = todayOnly.map(task => ({
      ...task,
      type: dateString === todayString ? 'today-only' : (dateString > todayString ? 'future' : 'past')
    }))
    tasks = [...tasks, ...todayOnlyTaskObjects]

    // Get postponed tasks for this date
    const postponed = this.postponedTasks[dateString] || []
    const postponedTaskObjects = postponed.map(task => ({
      ...task,
      type: 'postponed'
    }))
    tasks = [...tasks, ...postponedTaskObjects]

    return tasks
  }

  updateDatePreview(dateString) {
    const date = new Date(dateString + 'T00:00:00')
    const options = { month: 'long', day: 'numeric', weekday: 'long' }
    const formattedDate = date.toLocaleDateString('ja-JP', options)

    document.getElementById('preview-date').textContent = formattedDate

    const tasks = this.getTasksForDate(dateString)
    const previewContainer = document.getElementById('preview-tasks')

    if (tasks.length === 0) {
      previewContainer.innerHTML = '<p class="no-preview-tasks">この日にはタスクがありません</p>'
      return
    }

    previewContainer.innerHTML = ''

    tasks.forEach(task => {
      const typeLabel = this.getTypeLabel(task.type)
      const canModify = (task.type === 'today-only' || task.type === 'future' || task.type === 'past' || task.type === 'postponed')
      const canDelete = canModify && dateString >= getLocalDateString()

      // Add original date info for preview
      const originalDateInfo = this.getOriginalDateInfo(task)

      const taskDiv = document.createElement('div')
      taskDiv.className = 'preview-task'
      taskDiv.id = `preview-task-${task.id}`

      const taskText = document.createElement('span')
      taskText.className = 'preview-task-text'
      taskText.innerHTML = `${this.escapeHtml(task.name)}${originalDateInfo}`

      const taskActions = document.createElement('div')
      taskActions.className = 'preview-task-actions'

      const typeSpan = document.createElement('span')
      typeSpan.className = `preview-task-type ${task.type}`
      typeSpan.textContent = typeLabel
      taskActions.appendChild(typeSpan)

      if (canModify) {
        const moveBtn = document.createElement('button')
        moveBtn.className = 'preview-move-btn'
        moveBtn.textContent = '📅'
        moveBtn.title = '日付を変更'
        moveBtn.addEventListener('click', () => {
          this.showMoveDatePicker(task.id, dateString)
        })
        taskActions.appendChild(moveBtn)
      }

      if (canDelete) {
        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'preview-delete-btn'
        deleteBtn.textContent = '×'
        deleteBtn.addEventListener('click', () => {
          this.deleteFutureTodo(task.id, dateString)
        })
        taskActions.appendChild(deleteBtn)
      }

      taskDiv.appendChild(taskText)
      taskDiv.appendChild(taskActions)

      // Date picker section
      const pickerDiv = document.createElement('div')
      pickerDiv.className = 'move-date-picker'
      pickerDiv.id = `move-picker-${task.id}`
      pickerDiv.style.display = 'none'

      const dateInput = document.createElement('input')
      dateInput.type = 'date'
      dateInput.className = 'move-date-input'
      dateInput.id = `move-date-${task.id}`
      dateInput.min = getLocalDateString()

      const moveConfirmBtn = document.createElement('button')
      moveConfirmBtn.className = 'btn btn-primary btn-small'
      moveConfirmBtn.textContent = '移動'
      moveConfirmBtn.addEventListener('click', () => {
        this.moveTask(task.id, dateString)
      })

      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'btn btn-secondary btn-small'
      cancelBtn.textContent = '×'
      cancelBtn.addEventListener('click', () => {
        this.hideMoveDatePicker(task.id)
      })

      pickerDiv.appendChild(dateInput)
      pickerDiv.appendChild(moveConfirmBtn)
      pickerDiv.appendChild(cancelBtn)

      taskDiv.appendChild(pickerDiv)
      previewContainer.appendChild(taskDiv)
    })
  }

  async addFutureTodoFromCalendar() {
    if (!this.selectedDate) {
      this.showSuccessMessage('日付を選択してください')
      return
    }

    const input = document.getElementById('future-todo-text')
    const text = input.value.trim()

    if (text === '') {
      return
    }

    await this.addFutureTodo(text, this.selectedDate)
    input.value = ''
    this.renderCalendar() // Refresh calendar to show new task indicator
    this.updateDatePreview(this.selectedDate) // Refresh preview
  }

  async addFutureTodoFromForm() {
    const taskInput = document.getElementById('future-task-input')
    const dateInput = document.getElementById('future-task-date')

    const text = taskInput.value.trim()
    const date = dateInput.value

    if (text === '') {
      this.showSuccessMessage('タスク名を入力してください')
      return
    }

    if (date === '') {
      this.showSuccessMessage('実行日を選択してください')
      return
    }

    await this.addFutureTodo(text, date)
    taskInput.value = ''
    dateInput.value = ''

    // If calendar is visible and showing the same month, refresh it
    if (this.calendarVisible) {
      this.renderCalendar()
    }

    this.showSuccessMessage('未来のタスクを追加しました')
  }

  async addFutureTodo(text, dateString) {
    const task = {
      id: Date.now() + Math.random(),
      name: text,
      createdAt: new Date().toISOString()
    }

    if (!this.todayOnlyTasks[dateString]) {
      this.todayOnlyTasks[dateString] = []
    }

    this.todayOnlyTasks[dateString].push(task)
    await this.saveData()
  }

  async deleteFutureTodo(taskId, dateString) {
    if (this.todayOnlyTasks[dateString]) {
      this.todayOnlyTasks[dateString] = this.todayOnlyTasks[dateString].filter(task => task.id !== taskId)
      await this.saveData()

      // Refresh displays
      if (this.calendarVisible) {
        this.renderCalendar()
        if (this.selectedDate === dateString) {
          this.updateDatePreview(dateString)
        }
      } else if (dateString === this.getTodayString()) {
        this.updateDisplay()
      }
    }
  }

  // Task moving functionality
  showMoveDatePicker(taskId, currentDate) {
    // Hide all other pickers first
    document.querySelectorAll('.move-date-picker').forEach(picker => {
      picker.style.display = 'none'
    })

    // Show this picker
    const picker = document.getElementById(`move-picker-${taskId}`)
    if (picker) {
      picker.style.display = 'flex'
      // Set current date as default
      const dateInput = document.getElementById(`move-date-${taskId}`)
      if (dateInput) {
        dateInput.value = currentDate
        dateInput.focus()

        // Automatically open the date picker
        try {
          dateInput.showPicker()
        } catch (error) {
          // showPicker() not supported in some browsers, fallback to focus
        }
      }
    }
  }

  hideMoveDatePicker(taskId) {
    const picker = document.getElementById(`move-picker-${taskId}`)
    if (picker) {
      picker.style.display = 'none'
    }
  }

  async moveTask(taskId, fromDate) {
    const dateInput = document.getElementById(`move-date-${taskId}`)
    if (!dateInput) return

    const toDate = dateInput.value
    if (!toDate || toDate === fromDate) {
      this.hideMoveDatePicker(taskId)
      return
    }

    // Find the task in either todayOnlyTasks or postponedTasks
    let task = null
    let taskSource = null

    // Check todayOnlyTasks
    if (this.todayOnlyTasks[fromDate]) {
      task = this.todayOnlyTasks[fromDate].find(t => t.id === taskId)
      if (task) {
        taskSource = 'todayOnly'
      }
    }

    // Check postponedTasks
    if (!task && this.postponedTasks[fromDate]) {
      task = this.postponedTasks[fromDate].find(t => t.id === taskId)
      if (task) {
        taskSource = 'postponed'
      }
    }

    if (!task) {
      this.showSuccessMessage('タスクが見つかりませんでした')
      return
    }

    // Remove from source date
    if (taskSource === 'todayOnly') {
      this.todayOnlyTasks[fromDate] = this.todayOnlyTasks[fromDate].filter(t => t.id !== taskId)
    } else if (taskSource === 'postponed') {
      this.postponedTasks[fromDate] = this.postponedTasks[fromDate].filter(t => t.id !== taskId)
    }

    // Add to destination date (always as todayOnly task)
    if (!this.todayOnlyTasks[toDate]) {
      this.todayOnlyTasks[toDate] = []
    }

    const movedTask = {
      id: Date.now() + Math.random(), // New ID to avoid conflicts
      name: task.name,
      createdAt: new Date().toISOString()
    }

    this.todayOnlyTasks[toDate].push(movedTask)
    this.addActivityLog('moved', task.name, { from: fromDate, to: toDate })

    await this.saveData()

    // Refresh displays
    this.renderCalendar()
    if (this.selectedDate === fromDate) {
      this.updateDatePreview(fromDate)
    }

    const fromDateObj = new Date(fromDate + 'T00:00:00')
    const toDateObj = new Date(toDate + 'T00:00:00')
    const fromStr = fromDateObj.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    const toStr = toDateObj.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })

    this.showSuccessMessage(`タスクを ${fromStr} から ${toStr} に移動しました`)
  }

  getTaskNameById(taskId, taskType = null) {
    const todayString = this.getTodayString()

    // 今日だけのタスクから検索
    if (this.todayOnlyTasks[todayString]) {
      const task = this.todayOnlyTasks[todayString].find(task => task.id == taskId)
      if (task) return task.name
    }

    // 延期されたタスクから検索
    if (this.postponedTasks[todayString]) {
      const task = this.postponedTasks[todayString].find(task => task.id == taskId)
      if (task) return task.name
    }

    // ルーティンタスクから検索
    const routineTask = this.tasks.find(task => task.id == taskId)
    if (routineTask) return routineTask.name

    return null
  }
}

// グローバルインスタンス（カレンダープレビューでの削除ボタン用）
let taskManager

// アプリケーション開始
document.addEventListener('DOMContentLoaded', () => {
  taskManager = new TaskManager()
})

// サイドパネルを閉じるメッセージをリスン（タイムスタンプ方式）
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.shouldCloseSidePanel) {
    // 数値（タイムスタンプ）が設定されている場合は閉じる
    if (changes.shouldCloseSidePanel.newValue &&
        typeof changes.shouldCloseSidePanel.newValue === 'number') {
      chrome.storage.local.set({ shouldCloseSidePanel: 0 });
      window.close();
    }
  }
});

// サイドパネルが閉じる時
window.addEventListener('beforeunload', async () => {
  await chrome.storage.local.set({ sidePanelOpen: false });
});