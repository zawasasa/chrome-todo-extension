class SettingsManager {
  constructor() {
    this.tasks = []
    this.editingTaskId = null
    this.chrome = window.chrome // Declare the chrome variable
    this.init()
  }

  async init() {
    await this.loadTasks()
    this.setupEventListeners()
    this.renderTaskList()
  }

  async loadTasks() {
    try {
      const result = await this.chrome.storage.local.get(["tasks"])
      this.tasks = result.tasks || []
    } catch (error) {
      console.error("タスクの読み込みに失敗しました:", error)
    }
  }

  async saveTasks() {
    try {
      await this.chrome.storage.local.set({ tasks: this.tasks })
    } catch (error) {
      console.error("タスクの保存に失敗しました:", error)
    }
  }

  setupEventListeners() {
    // 戻るボタン
    document.getElementById("back-btn").addEventListener("click", () => {
      window.close()
    })

    // タスクタイプ変更時の表示切り替え
    document.getElementById("task-type").addEventListener("change", (e) => {
      this.toggleTaskTypeOptions(e.target.value, "add")
    })

    document.getElementById("edit-task-type").addEventListener("change", (e) => {
      this.toggleTaskTypeOptions(e.target.value, "edit")
    })

    // フォーム送信
    document.getElementById("task-form").addEventListener("submit", (e) => {
      e.preventDefault()
      this.addTask()
    })

    document.getElementById("edit-form").addEventListener("submit", (e) => {
      e.preventDefault()
      this.updateTask()
    })

    // モーダル関連
    document.getElementById("close-modal").addEventListener("click", () => {
      this.closeModal()
    })

    document.getElementById("cancel-edit").addEventListener("click", () => {
      this.closeModal()
    })

    // モーダル外クリックで閉じる
    document.getElementById("edit-modal").addEventListener("click", (e) => {
      if (e.target.id === "edit-modal") {
        this.closeModal()
      }
    })
  }

  toggleTaskTypeOptions(type, mode) {
    const prefix = mode === "edit" ? "edit-" : ""
    const weeklyOptions = document.getElementById(`${prefix}weekly-options`)
    const monthlyOptions = document.getElementById(`${prefix}monthly-options`)

    weeklyOptions.style.display = type === "weekly" ? "block" : "none"
    monthlyOptions.style.display = type === "monthly" ? "block" : "none"
  }

  generateTaskId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  addTask() {
    const formData = new FormData(document.getElementById("task-form"))
    const taskName = formData.get("taskName").trim()
    const taskType = formData.get("taskType")

    if (!taskName || !taskType) {
      this.showNotification("タスク名と実行頻度を入力してください。", "error")
      return
    }

    const task = {
      id: this.generateTaskId(),
      name: taskName,
      type: taskType,
    }

    if (taskType === "weekly") {
      const weekdays = formData.getAll("weekdays").map((day) => Number.parseInt(day))
      if (weekdays.length === 0) {
        this.showNotification("実行曜日を選択してください。", "error")
        return
      }
      task.days = weekdays
    } else if (taskType === "monthly") {
      const monthlyDay = formData.get("monthlyDay")
      if (!monthlyDay) {
        this.showNotification("実行日を選択してください。", "error")
        return
      }
      task.day = monthlyDay === "last" ? "last" : Number.parseInt(monthlyDay)
    }

    this.tasks.push(task)
    this.saveTasks()
    this.renderTaskList()
    this.resetForm()
    this.showNotification("タスクを追加しました。", "success")
  }

  editTask(taskId) {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return

    this.editingTaskId = taskId

    // フォームに値を設定
    document.getElementById("edit-task-name").value = task.name
    document.getElementById("edit-task-type").value = task.type

    this.toggleTaskTypeOptions(task.type, "edit")

    if (task.type === "weekly") {
      const checkboxes = document.querySelectorAll('input[name="editWeekdays"]')
      checkboxes.forEach((checkbox) => {
        checkbox.checked = task.days.includes(Number.parseInt(checkbox.value))
      })
    } else if (task.type === "monthly") {
      document.getElementById("edit-monthly-day").value = task.day
    }

    document.getElementById("edit-modal").style.display = "flex"
  }

  updateTask() {
    const formData = new FormData(document.getElementById("edit-form"))
    const taskName = formData.get("taskName").trim()
    const taskType = formData.get("taskType")

    if (!taskName || !taskType) {
      alert("タスク名と実行頻度を入力してください。")
      return
    }

    const taskIndex = this.tasks.findIndex((t) => t.id === this.editingTaskId)
    if (taskIndex === -1) return

    const task = {
      id: this.editingTaskId,
      name: taskName,
      type: taskType,
    }

    if (taskType === "weekly") {
      const weekdays = formData.getAll("editWeekdays").map((day) => Number.parseInt(day))
      if (weekdays.length === 0) {
        alert("実行曜日を選択してください。")
        return
      }
      task.days = weekdays
    } else if (taskType === "monthly") {
      const monthlyDay = formData.get("monthlyDay")
      if (!monthlyDay) {
        alert("実行日を選択してください。")
        return
      }
      task.day = monthlyDay === "last" ? "last" : Number.parseInt(monthlyDay)
    }

    this.tasks[taskIndex] = task
    this.saveTasks()
    this.renderTaskList()
    this.closeModal()
  }

  deleteTask(taskId) {
    if (!confirm("このタスクを削除しますか？")) return

    this.tasks = this.tasks.filter((t) => t.id !== taskId)
    this.saveTasks()
    this.renderTaskList()
    this.showNotification("タスクを削除しました。", "success")
  }

  closeModal() {
    document.getElementById("edit-modal").style.display = "none"
    this.editingTaskId = null
  }

  resetForm() {
    document.getElementById("task-form").reset()
    this.toggleTaskTypeOptions("", "add")
  }

  renderTaskList() {
    const container = document.getElementById("task-list-container")
    const noTasksMessage = document.getElementById("no-registered-tasks")

    if (this.tasks.length === 0) {
      noTasksMessage.style.display = "block"
      container.innerHTML = ""
      return
    }

    noTasksMessage.style.display = "none"
    container.innerHTML = ""

    this.tasks.forEach((task) => {
      const taskElement = document.createElement("div")
      taskElement.className = "task-item"

      const taskDetails = this.getTaskDetailsText(task)

      taskElement.innerHTML = `
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-details">${taskDetails}</div>
                </div>
                <div class="task-actions">
                    <button class="edit-btn" data-task-id="${task.id}">編集</button>
                    <button class="delete-btn" data-task-id="${task.id}">削除</button>
                </div>
            `

      // イベントリスナーを追加
      taskElement.querySelector(".edit-btn").addEventListener("click", () => {
        this.editTask(task.id)
      })

      taskElement.querySelector(".delete-btn").addEventListener("click", () => {
        this.deleteTask(task.id)
      })

      container.appendChild(taskElement)
    })
  }

  getTaskDetailsText(task) {
    switch (task.type) {
      case "daily":
        return "毎日（月〜金）"
      case "weekly":
        const dayNames = ["", "月", "火", "水", "木", "金"]
        const selectedDays = task.days.map((day) => dayNames[day]).join("、")
        return `毎週（${selectedDays}曜日）`
      case "monthly":
        if (task.day === "last") {
          return "毎月（月末）"
        }
        return `毎月（${task.day}日）`
      default:
        return ""
    }
  }

  showNotification(message, type = "info") {
    // 既存の通知を削除
    const existingNotification = document.querySelector(".notification")
    if (existingNotification) {
      existingNotification.remove()
    }

    const notification = document.createElement("div")
    notification.className = `notification notification-${type}`
    notification.textContent = message

    document.body.appendChild(notification)

    // 3秒後に自動削除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove()
      }
    }, 3000)
  }
}

// アプリケーション開始
document.addEventListener("DOMContentLoaded", () => {
  new SettingsManager()
})
