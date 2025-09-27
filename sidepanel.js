class TaskManager {
  constructor() {
    this.tasks = []
    this.completedTasks = {}
    this.chrome = window.chrome // Declare the chrome variable
    this.init()
  }

  async init() {
    await this.loadData()
    this.setupEventListeners()
    this.updateDisplay()
    this.startPeriodicUpdate()
  }

  async loadData() {
    try {
      const result = await this.chrome.storage.local.get(["tasks", "completedTasks"])
      this.tasks = result.tasks || []
      this.completedTasks = result.completedTasks || {}
    } catch (error) {
      console.error("データの読み込みに失敗しました:", error)
    }
  }

  async saveData() {
    try {
      await this.chrome.storage.local.set({
        tasks: this.tasks,
        completedTasks: this.completedTasks,
      })
    } catch (error) {
      console.error("データの保存に失敗しました:", error)
    }
  }

  setupEventListeners() {
    document.getElementById("settings-btn").addEventListener("click", () => {
      this.chrome.tabs.create({ url: this.chrome.runtime.getURL("settings.html") })
    })

    document.getElementById("refresh-btn").addEventListener("click", () => {
      this.updateDisplay()
    })
  }

  isWeekday() {
    const today = new Date()
    const dayOfWeek = today.getDay()
    return dayOfWeek >= 1 && dayOfWeek <= 5 // 月曜日(1)から金曜日(5)
  }

  getTodayString() {
    const today = new Date()
    return today.toISOString().split("T")[0]
  }

  getTodayTasks() {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const dayOfMonth = today.getDate()
    const isLastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() === dayOfMonth

    return this.tasks.filter((task) => {
      switch (task.type) {
        case "daily":
          return true
        case "weekly":
          return task.days.includes(dayOfWeek)
        case "monthly":
          if (task.day === "last") {
            return isLastDayOfMonth
          }
          return task.day === dayOfMonth
        default:
          return false
      }
    })
  }

  async toggleTask(taskId) {
    const todayString = this.getTodayString()

    if (!this.completedTasks[todayString]) {
      this.completedTasks[todayString] = {}
    }

    this.completedTasks[todayString][taskId] = !this.completedTasks[todayString][taskId]
    await this.saveData()
    this.updateDisplay()
  }

  isTaskCompleted(taskId) {
    const todayString = this.getTodayString()
    return this.completedTasks[todayString]?.[taskId] || false
  }

  updateDisplay() {
    this.updateDateDisplay()
    this.showTaskList()
    this.updateProgressDisplay()
  }

  updateDateDisplay() {
    const today = new Date()
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }
    document.getElementById("current-date").textContent = today.toLocaleDateString("ja-JP", options)
  }

  showTaskList() {
    document.getElementById("task-container").style.display = "block"

    const todayTasks = this.getTodayTasks()
    const taskList = document.getElementById("task-list")
    const noTasksMessage = document.getElementById("no-tasks")

    if (todayTasks.length === 0) {
      noTasksMessage.style.display = "block"
      taskList.innerHTML = ""
      return
    }

    noTasksMessage.style.display = "none"
    this.renderTasks(todayTasks)
  }

  renderTasks(tasks) {
    const taskList = document.getElementById("task-list")
    taskList.innerHTML = ""

    tasks.forEach((task) => {
      const li = document.createElement("li")
      li.className = "task-item"

      const isCompleted = this.isTaskCompleted(task.id)
      if (isCompleted) {
        li.classList.add("completed")
      }

      li.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${isCompleted ? "checked" : ""}
                       data-task-id="${task.id}">
                <span class="task-text ${isCompleted ? "completed" : ""}">${task.name}</span>
                <span class="task-type ${task.type}">${this.getTypeLabel(task.type)}</span>
            `

      const checkbox = li.querySelector(".task-checkbox")
      checkbox.addEventListener("change", () => {
        this.toggleTask(task.id)
      })

      taskList.appendChild(li)
    })
  }

  getTypeLabel(type) {
    switch (type) {
      case "daily":
        return "毎日"
      case "weekly":
        return "毎週"
      case "monthly":
        return "毎月"
      default:
        return ""
    }
  }

  startPeriodicUpdate() {
    // 1分ごとに表示を更新（日付変更を検知）
    setInterval(() => {
      this.updateDisplay()
    }, 60000)
  }

  updateProgressDisplay() {
    const todayTasks = this.getTodayTasks()
    if (todayTasks.length === 0) return

    const completedCount = todayTasks.filter((task) => this.isTaskCompleted(task.id)).length

    const progressText = `${completedCount}/${todayTasks.length} 完了`

    // 既存の進捗表示を更新または作成
    let progressElement = document.getElementById("progress-display")
    if (!progressElement) {
      progressElement = document.createElement("div")
      progressElement.id = "progress-display"
      progressElement.className = "progress-display"
      document.querySelector(".header").appendChild(progressElement)
    }

    progressElement.textContent = progressText
  }
}

// アプリケーション開始
document.addEventListener("DOMContentLoaded", () => {
  new TaskManager()
})