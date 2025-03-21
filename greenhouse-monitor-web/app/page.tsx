"use client"

import { useEffect, useState, useRef } from "react"
import mqtt from "mqtt"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import { motion, AnimatePresence } from "framer-motion"
import {
  Thermometer,
  Droplet,
  AlertTriangle,
  Menu,
  X,
  RefreshCw,
  Leaf,
  Waves,
  Info,
  Download,
  Gauge,
  Sun,
  Palette,
} from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// ==================== CONFIGURACIÓN ====================

// MQTT - Debe coincidir con el Arduino
const MQTT_BROKER = "wss://broker.emqx.io:8084/mqtt"
const MQTT_TOPIC = "invernadero/sensores"

// Valores óptimos para los sensores
const HUMEDAD_SUELO_OPTIMA: [number, number] = [20, 60]
const TEMPERATURA_OPTIMA: [number, number] = [22, 28]
const HUMEDAD_AIRE_OPTIMA: [number, number] = [40, 70]
const TDS_OPTIMO: [number, number] = [100, 800]

// Número máximo de puntos en los gráficos
const TIEMPO_MAX = 30

// ==================== INTERFACES ====================

interface SensorData {
  temperature?: number
  humidity?: number
  soil_moisture?: number
  pressure?: number
  tds?: number
  water_level?: number
  light?: number
  color?: {
    r: number
    g: number
    b: number
  }
  timestamp?: number
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function GreenhouseMonitor() {
  // ==================== ESTADOS ====================
  const [sensorData, setSensorData] = useState<SensorData>({})
  const [sensorHistory, setSensorHistory] = useState<{
    soil_moisture: number[]
    temperature: number[]
    humidity: number[]
    tds: number[]
  }>({
    soil_moisture: [],
    temperature: [],
    humidity: [],
    tds: [],
  })
  const [timeHistory, setTimeHistory] = useState<string[]>([])
  const [status, setStatus] = useState("Esperando conexión...")
  const [isConnected, setIsConnected] = useState(false)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [darkMode, setDarkMode] = useState(true)

  // ==================== REFERENCIAS ====================
  const clientRef = useRef<mqtt.MqttClient | null>(null)
  const dataLogRef = useRef<SensorData[]>([])
  const connectionAttemptsRef = useRef(0)

  // ==================== EFECTOS ====================
  useEffect(() => {
    setIsLoading(true)
    console.log("Iniciando conexión MQTT...")

    try {
      console.log("Intentando conectar a MQTT broker:", MQTT_BROKER)
      clientRef.current = mqtt.connect(MQTT_BROKER, {
        clientId: `greenhouse_monitor_web_${Math.random().toString(16).substring(2, 10)}`,
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
      })

      clientRef.current.on("connect", () => {
        console.log("Conectado a MQTT broker")
        setStatus("Conectado a MQTT")
        setIsConnected(true)
        clientRef.current?.subscribe(MQTT_TOPIC)
        connectionAttemptsRef.current = 0
      })

      clientRef.current.on("message", (topic, message) => {
        try {
          console.log("Mensaje MQTT recibido:", message.toString())
          const data = JSON.parse(message.toString()) as SensorData
          data.timestamp = Date.now()

          setSensorData((prev) => ({ ...prev, ...data }))
          dataLogRef.current.push(data)
          setLastUpdate(new Date())

          // Update time labels
          const now = new Date()
          const timeLabel = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`

          setTimeHistory((prev) => {
            const newHistory = [...prev]
            if (newHistory.length >= TIEMPO_MAX) {
              newHistory.shift()
            }
            newHistory.push(timeLabel)
            return newHistory
          })

          // Update sensor histories
          setSensorHistory((prev) => {
            const newHistory = { ...prev }

            if (typeof data.soil_moisture === "number") {
              if (newHistory.soil_moisture.length >= TIEMPO_MAX) {
                newHistory.soil_moisture.shift()
              }
              newHistory.soil_moisture.push(data.soil_moisture)
            }

            if (typeof data.temperature === "number") {
              if (newHistory.temperature.length >= TIEMPO_MAX) {
                newHistory.temperature.shift()
              }
              newHistory.temperature.push(data.temperature)
            }

            if (typeof data.humidity === "number") {
              if (newHistory.humidity.length >= TIEMPO_MAX) {
                newHistory.humidity.shift()
              }
              newHistory.humidity.push(data.humidity)
            }

            if (typeof data.tds === "number") {
              if (newHistory.tds.length >= TIEMPO_MAX) {
                newHistory.tds.shift()
              }
              newHistory.tds.push(data.tds)
            }

            return newHistory
          })

          // Salir del modo de carga después de recibir datos
          setIsLoading(false)
        } catch (error) {
          console.error("Error al procesar datos MQTT:", error)
          setStatus("Error al procesar datos: " + (error instanceof Error ? error.message : String(error)))
        }
      })

      clientRef.current.on("error", (err) => {
        console.error("Error MQTT:", err)
        setStatus(`Error de conexión: ${err.message}`)
        setIsConnected(false)
        connectionAttemptsRef.current++
      })

      clientRef.current.on("offline", () => {
        console.log("MQTT desconectado")
        setStatus("Desconectado del broker MQTT")
        setIsConnected(false)
      })
    } catch (error) {
      console.error("Error al inicializar conexión MQTT:", error)
      setStatus("Error al inicializar conexión MQTT: " + (error instanceof Error ? error.message : String(error)))
      setIsConnected(false)
      connectionAttemptsRef.current++
    }

    // Establecer un timeout para salir del modo de carga después de 10 segundos
    // incluso si no hay datos, para evitar que la interfaz se quede bloqueada
    const loadingTimeout = setTimeout(() => {
      if (isLoading) {
        console.log("Timeout de carga alcanzado, mostrando interfaz")
        setIsLoading(false)
        if (!isConnected) {
          setStatus("No se recibieron datos. Verifica la conexión del Arduino.")
        }
      }
    }, 10000)

    return () => {
      clearTimeout(loadingTimeout)
      if (clientRef.current) {
        console.log("Cerrando conexión MQTT")
        clientRef.current.end()
      }
    }
  }, [])

  // ==================== FUNCIONES AUXILIARES ====================

  const getChartData = (dataType: "soil_moisture" | "temperature" | "humidity" | "tds") => {
    const datasets = []
    const colors = {
      soil_moisture: { border: "#00FF00", background: "rgba(0, 255, 0, 0.2)" },
      temperature: { border: "#FF9900", background: "rgba(255, 153, 0, 0.2)" },
      humidity: { border: "#60a5fa", background: "rgba(96, 165, 250, 0.2)" },
      tds: { border: "#c084fc", background: "rgba(192, 132, 252, 0.2)" },
    }

    const labels = {
      soil_moisture: "Humedad del Suelo",
      temperature: "Temperatura",
      humidity: "Humedad del Aire",
      tds: "TDS (ppm)",
    }

    datasets.push({
      label: labels[dataType],
      data: sensorHistory[dataType],
      borderColor: colors[dataType].border,
      backgroundColor: colors[dataType].background,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: colors[dataType].border,
      fill: true,
    })

    // Add optimal range for each sensor type
    if (dataType === "soil_moisture") {
      datasets.push({
        label: "Mínimo Óptimo",
        data: Array(timeHistory.length).fill(HUMEDAD_SUELO_OPTIMA[0]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })

      datasets.push({
        label: "Máximo Óptimo",
        data: Array(timeHistory.length).fill(HUMEDAD_SUELO_OPTIMA[1]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })
    } else if (dataType === "temperature") {
      datasets.push({
        label: "Mínimo Óptimo",
        data: Array(timeHistory.length).fill(TEMPERATURA_OPTIMA[0]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })

      datasets.push({
        label: "Máximo Óptimo",
        data: Array(timeHistory.length).fill(TEMPERATURA_OPTIMA[1]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })
    } else if (dataType === "humidity") {
      datasets.push({
        label: "Mínimo Óptimo",
        data: Array(timeHistory.length).fill(HUMEDAD_AIRE_OPTIMA[0]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })

      datasets.push({
        label: "Máximo Óptimo",
        data: Array(timeHistory.length).fill(HUMEDAD_AIRE_OPTIMA[1]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })
    } else if (dataType === "tds") {
      datasets.push({
        label: "Mínimo Óptimo",
        data: Array(timeHistory.length).fill(TDS_OPTIMO[0]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })

      datasets.push({
        label: "Máximo Óptimo",
        data: Array(timeHistory.length).fill(TDS_OPTIMO[1]),
        borderColor: "rgba(255, 204, 0, 0.7)",
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      })
    }

    return {
      labels: timeHistory,
      datasets,
    }
  }

  const getChartOptions = (dataType: "soil_moisture" | "temperature" | "humidity" | "tds") => {
    const ranges = {
      soil_moisture: { min: 0, max: 100, unit: "%" },
      temperature: { min: 15, max: 35, unit: "°C" },
      humidity: { min: 0, max: 100, unit: "%" },
      tds: { min: 0, max: 1000, unit: "ppm" },
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1000,
        easing: "easeOutQuart",
      },
      scales: {
        y: {
          min: ranges[dataType].min,
          max: ranges[dataType].max,
          grid: {
            color: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
          },
          ticks: {
            color: darkMode ? "#00FF00" : "#1f2937",
            font: {
              family: "Consolas, monospace",
            },
            callback: (value: number) => value + ranges[dataType].unit,
          },
          title: {
            display: true,
            text:
              dataType === "soil_moisture"
                ? "Humedad (%)"
                : dataType === "temperature"
                  ? "Temperatura (°C)"
                  : dataType === "humidity"
                    ? "Humedad (%)"
                    : "TDS (ppm)",
            color: darkMode ? "#00FF00" : "#1f2937",
            font: {
              family: "Consolas, monospace",
            },
          },
        },
        x: {
          grid: {
            color: darkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
          },
          ticks: {
            color: darkMode ? "#00FF00" : "#1f2937",
            font: {
              family: "Consolas, monospace",
            },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
          title: {
            display: true,
            text: "Tiempo",
            color: darkMode ? "#00FF00" : "#1f2937",
            font: {
              family: "Consolas, monospace",
            },
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: darkMode ? "#00FF00" : "#1f2937",
            font: {
              family: "Consolas, monospace",
            },
          },
        },
        tooltip: {
          backgroundColor: darkMode ? "rgba(31, 41, 55, 0.9)" : "rgba(255, 255, 255, 0.9)",
          titleColor: darkMode ? "#00FF00" : "#1f2937",
          bodyColor: darkMode ? "#00FF00" : "#1f2937",
          borderColor: darkMode ? "#00FF00" : "#1f2937",
          borderWidth: 1,
          padding: 10,
          titleFont: {
            family: "Consolas, monospace",
          },
          bodyFont: {
            family: "Consolas, monospace",
          },
          callbacks: {
            label: (context: any) => `${context.dataset.label}: ${context.raw}${ranges[dataType].unit}`,
          },
        },
      },
    }
  }

  const getValueColor = (value: number | undefined, [min, max]: number[]) => {
    if (value === undefined) return "text-gray-400"
    return value >= min && value <= max ? "text-green-500" : "text-red-500"
  }

  const getStatusIndicator = () => {
    if (isConnected) {
      return "bg-green-500"
    } else {
      return "bg-red-500"
    }
  }

  const formatLastUpdate = () => {
    if (!lastUpdate) return "No hay datos"

    const now = new Date()
    const diff = now.getTime() - lastUpdate.getTime()

    if (diff < 60000) {
      return `Hace ${Math.floor(diff / 1000)} segundos`
    } else if (diff < 3600000) {
      return `Hace ${Math.floor(diff / 60000)} minutos`
    } else {
      return `${lastUpdate.toLocaleTimeString()}`
    }
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const reconnect = () => {
    setStatus("Reconectando...")
    if (clientRef.current) {
      clientRef.current.end()
    }

    setTimeout(() => {
      console.log("Intentando reconectar a MQTT broker:", MQTT_BROKER)
      clientRef.current = mqtt.connect(MQTT_BROKER, {
        clientId: `greenhouse_monitor_web_${Math.random().toString(16).substring(2, 10)}`,
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
      })

      clientRef.current.on("connect", () => {
        console.log("Reconectado a MQTT broker")
        setStatus("Conectado a MQTT")
        setIsConnected(true)
        clientRef.current?.subscribe(MQTT_TOPIC)
      })

      clientRef.current.on("message", (topic, message) => {
        try {
          console.log("Mensaje MQTT recibido:", message.toString())
          const data = JSON.parse(message.toString()) as SensorData
          setSensorData((prev) => ({ ...prev, ...data }))
          dataLogRef.current.push(data)
          setLastUpdate(new Date())
        } catch (error) {
          console.error("Error al procesar datos MQTT:", error)
        }
      })
    }, 1000)
  }

  const exportData = (format: "csv" | "json") => {
    if (dataLogRef.current.length === 0) {
      alert("No hay datos para exportar")
      return
    }

    let content = ""
    let filename = `greenhouse_data_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`

    if (format === "csv") {
      // Create CSV header
      const headers = [
        "timestamp",
        "temperature",
        "humidity",
        "soil_moisture",
        "pressure",
        "tds",
        "water_level",
        "light",
        "color_r",
        "color_g",
        "color_b",
      ]
      content = headers.join(",") + "\n"

      // Add data rows
      dataLogRef.current.forEach((data) => {
        const row = headers.map((header) => {
          if (header === "timestamp" && data.timestamp) {
            return new Date(data.timestamp).toISOString()
          } else if (header === "color_r" && data.color) {
            return data.color.r
          } else if (header === "color_g" && data.color) {
            return data.color.g
          } else if (header === "color_b" && data.color) {
            return data.color.b
          }
          return data[header.replace(/_[rgb]$/, "") as keyof SensorData] !== undefined
            ? data[header as keyof SensorData]
            : ""
        })
        content += row.join(",") + "\n"
      })

      filename += ".csv"
    } else {
      // JSON format
      content = JSON.stringify(dataLogRef.current, null, 2)
      filename += ".json"
    }

    // Create download link
    const blob = new Blob([content], { type: format === "csv" ? "text/csv" : "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  // ==================== RENDERIZADO ====================

  if (isLoading) {
    return (
      <div className={`min-h-screen ${darkMode ? "bg-black" : "bg-white"} flex items-center justify-center`}>
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="mb-4"
            >
              <RefreshCw size={48} className={darkMode ? "text-green-500" : "text-gray-800"} />
            </motion.div>
            <h1 className={`text-2xl font-mono ${darkMode ? "text-green-500" : "text-gray-800"} mb-2`}>
              MKR IoT Carrier Monitor
            </h1>
            <p className={darkMode ? "text-green-500" : "text-gray-800"}>Esperando datos del Arduino...</p>
            <p className={`mt-2 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>Conectando a {MQTT_BROKER}</p>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? "dark bg-black text-green-500" : "bg-white text-gray-800"}`}>
      {/* Header */}
      <header
        className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200"} border-b p-4 sticky top-0 z-10`}
      >
        <div className="container mx-auto flex justify-between items-center">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="text-xl md:text-2xl font-mono font-bold flex items-center"
          >
            <Leaf className="mr-2" /> MKR IoT Carrier Monitor
          </motion.h1>

          <div className="hidden md:flex space-x-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === "dashboard"
                  ? darkMode
                    ? "bg-green-500/20 border border-green-500"
                    : "bg-green-500/10 border border-green-500"
                  : darkMode
                    ? "hover:bg-gray-800"
                    : "hover:bg-gray-100"
              }`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === "environment"
                  ? darkMode
                    ? "bg-green-500/20 border border-green-500"
                    : "bg-green-500/10 border border-green-500"
                  : darkMode
                    ? "hover:bg-gray-800"
                    : "hover:bg-gray-100"
              }`}
              onClick={() => setActiveTab("environment")}
            >
              Ambiente
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === "water"
                  ? darkMode
                    ? "bg-green-500/20 border border-green-500"
                    : "bg-green-500/10 border border-green-500"
                  : darkMode
                    ? "hover:bg-gray-800"
                    : "hover:bg-gray-100"
              }`}
              onClick={() => setActiveTab("water")}
            >
              Agua
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === "light"
                  ? darkMode
                    ? "bg-green-500/20 border border-green-500"
                    : "bg-green-500/10 border border-green-500"
                  : darkMode
                    ? "hover:bg-gray-800"
                    : "hover:bg-gray-100"
              }`}
              onClick={() => setActiveTab("light")}
            >
              Luz
            </motion.button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-md ${darkMode ? "bg-gray-800 text-green-500" : "bg-gray-100 text-gray-800"}`}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
            <div className="md:hidden">
              <button onClick={toggleMobileMenu} className={`p-2 ${darkMode ? "text-green-500" : "text-gray-800"}`}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200"} border-b md:hidden`}
          >
            <div className="container mx-auto py-2 px-4 flex flex-col space-y-2">
              <button
                className={`p-2 rounded-md text-left ${
                  activeTab === "dashboard"
                    ? darkMode
                      ? "bg-green-500/20 border border-green-500"
                      : "bg-green-500/10 border border-green-500"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("dashboard")
                  setIsMobileMenuOpen(false)
                }}
              >
                Dashboard
              </button>
              <button
                className={`p-2 rounded-md text-left ${
                  activeTab === "environment"
                    ? darkMode
                      ? "bg-green-500/20 border border-green-500"
                      : "bg-green-500/10 border border-green-500"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("environment")
                  setIsMobileMenuOpen(false)
                }}
              >
                Ambiente
              </button>
              <button
                className={`p-2 rounded-md text-left ${
                  activeTab === "water"
                    ? darkMode
                      ? "bg-green-500/20 border border-green-500"
                      : "bg-green-500/10 border border-green-500"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("water")
                  setIsMobileMenuOpen(false)
                }}
              >
                Agua
              </button>
              <button
                className={`p-2 rounded-md text-left ${
                  activeTab === "light"
                    ? darkMode
                      ? "bg-green-500/20 border border-green-500"
                      : "bg-green-500/10 border border-green-500"
                    : ""
                }`}
                onClick={() => {
                  setActiveTab("light")
                  setIsMobileMenuOpen(false)
                }}
              >
                Luz
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="container mx-auto p-4">
        {/* Status Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={`mb-6 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}
        >
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${getStatusIndicator()} mr-2 animate-pulse`}></div>
            <span>{status}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
              Última actualización: {formatLastUpdate()}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={reconnect}
              className={`${darkMode ? "bg-green-500/20 hover:bg-green-500/30 border-green-500" : "bg-green-500/10 hover:bg-green-500/20 border-green-500"} border rounded-md px-3 py-1 text-sm flex items-center`}
            >
              <RefreshCw size={14} className="mr-1" /> Reconectar
            </motion.button>
          </div>
        </motion.div>

        {/* Export Data Panel */}
        <AnimatePresence>
          {showExportPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`mb-6 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-mono">Exportar Datos</h3>
                <button
                  onClick={() => setShowExportPanel(false)}
                  className={`p-1 rounded-full ${darkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => exportData("csv")}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md ${darkMode ? "bg-green-500/20 hover:bg-green-500/30 border-green-500" : "bg-green-500/10 hover:bg-green-500/20 border-green-500"} border`}
                >
                  <Download size={16} />
                  Exportar como CSV
                </button>
                <button
                  onClick={() => exportData("json")}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md ${darkMode ? "bg-green-500/20 hover:bg-green-500/30 border-green-500" : "bg-green-500/10 hover:bg-green-500/20 border-green-500"} border`}
                >
                  <Download size={16} />
                  Exportar como JSON
                </button>
              </div>
              <p className={`mt-4 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                Se exportarán {dataLogRef.current.length} registros de datos desde el inicio de la sesión.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content based on active tab */}
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {/* Temperature Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-mono flex items-center">
                      <Thermometer size={18} className="mr-2" /> Temperatura
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-green-500"
                          ? darkMode
                            ? "bg-green-500/20 text-green-500"
                            : "bg-green-500/10 text-green-500"
                          : darkMode
                            ? "bg-red-500/20 text-red-500"
                            : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-green-500"
                        ? "Óptimo"
                        : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className="text-4xl font-bold text-orange-400">
                      {sensorData.temperature?.toFixed(1) ?? "--"}°C
                    </span>
                  </div>
                  <div className={`relative h-2 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-2`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${((sensorData.temperature ?? 20) - 15) * 5}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>15°C</span>
                    <span>25°C</span>
                    <span>35°C</span>
                  </div>
                </motion.div>

                {/* Humidity Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                  className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-mono flex items-center">
                      <Droplet size={18} className="mr-2" /> Humedad Aire
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-green-500"
                          ? darkMode
                            ? "bg-green-500/20 text-green-500"
                            : "bg-green-500/10 text-green-500"
                          : darkMode
                            ? "bg-red-500/20 text-red-500"
                            : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-green-500"
                        ? "Óptimo"
                        : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span className="text-4xl font-bold text-blue-400">{sensorData.humidity?.toFixed(1) ?? "--"}%</span>
                  </div>
                  <div className={`relative h-2 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-2`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-blue-400 rounded-full transition-all duration-500"
                      style={{ width: `${sensorData.humidity ?? 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </motion.div>

                {/* Soil Moisture Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-mono flex items-center">
                      <Droplet size={18} className="mr-2" /> Humedad Suelo
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-green-500"
                          ? darkMode
                            ? "bg-green-500/20 text-green-500"
                            : "bg-green-500/10 text-green-500"
                          : darkMode
                            ? "bg-red-500/20 text-red-500"
                            : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-green-500"
                        ? "Óptimo"
                        : "Atención"}
                    </span>
                  </div>
                  <div className="text-center my-4">
                    <span
                      className={`text-4xl font-bold ${getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA)}`}
                    >
                      {sensorData.soil_moisture?.toFixed(1) ?? "--"}%
                    </span>
                  </div>
                  <div className={`relative h-2 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-2`}>
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-green-500" ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${sensorData.soil_moisture ?? 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Secondary Metrics */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                  className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <h3 className="text-lg font-mono mb-4">Métricas Secundarias</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Gauge className="mr-2" size={16} />
                        <span>Presión</span>
                      </div>
                      <span className="text-purple-400 font-mono">{sensorData.pressure?.toFixed(1) ?? "--"} hPa</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Waves className="mr-2" size={16} />
                        <span>TDS</span>
                      </div>
                      <span className="text-purple-400 font-mono">{sensorData.tds?.toFixed(1) ?? "--"} ppm</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Waves className="mr-2" size={16} />
                        <span>Nivel de Agua</span>
                      </div>
                      <span className="font-mono">{sensorData.water_level?.toFixed(0) ?? "--"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <Sun className="mr-2" size={16} />
                        <span>Luz</span>
                      </div>
                      <span className="font-mono">{sensorData.light?.toFixed(0) ?? "--"}</span>
                    </div>
                    {sensorData.color && (
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          <Palette className="mr-2" size={16} />
                          <span>Color RGB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{
                              backgroundColor: `rgb(${sensorData.color.r}, ${sensorData.color.g}, ${sensorData.color.b})`,
                            }}
                          ></div>
                          <span className="font-mono text-xs">
                            {sensorData.color.r}, {sensorData.color.g}, {sensorData.color.b}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-6">
                    <button
                      onClick={() => setShowExportPanel(!showExportPanel)}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md ${darkMode ? "bg-green-500/20 hover:bg-green-500/30 border-green-500" : "bg-green-500/10 hover:bg-green-500/20 border-green-500"} border`}
                    >
                      <Download size={16} />
                      Exportar Datos
                    </button>
                  </div>
                </motion.div>

                {/* Main Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                  className={`lg:col-span-2 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-mono">Tendencias Principales</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setActiveTab("environment")}
                        className={`px-2 py-1 text-xs rounded-md ${darkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
                      >
                        Ambiente
                      </button>
                      <button
                        onClick={() => setActiveTab("water")}
                        className={`px-2 py-1 text-xs rounded-md ${darkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
                      >
                        Agua
                      </button>
                    </div>
                  </div>
                  <div className="h-[300px]">
                    <Line data={getChartData("temperature")} options={getChartOptions("temperature")} />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {activeTab === "environment" && (
            <motion.div
              key="environment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Temperature Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Thermometer size={20} className="mr-2" /> Temperatura
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("temperature")} options={getChartOptions("temperature")} />
                </div>
              </div>

              {/* Temperature Details */}
              <div
                className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border flex flex-col`}
              >
                <h2 className="text-xl font-mono mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold mb-2 text-orange-400">
                      {sensorData.temperature?.toFixed(1) ?? "--"}
                      <span className="text-2xl">°C</span>
                    </div>
                    <div className={darkMode ? "text-gray-400" : "text-gray-500"}>Temperatura Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-6`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${((sensorData.temperature ?? 20) - 15) * 5}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${(TEMPERATURA_OPTIMA[0] - 15) * 5}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${(TEMPERATURA_OPTIMA[1] - 15) * 5}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-gray-400" : "text-sm text-gray-500"}>Mínima Óptima</div>
                      <div className="text-xl font-semibold text-orange-400">{TEMPERATURA_OPTIMA[0]}°C</div>
                    </div>
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-gray-400" : "text-sm text-gray-500"}>Máxima Óptima</div>
                      <div className="text-xl font-semibold text-orange-400">{TEMPERATURA_OPTIMA[1]}°C</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${
                        getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-green-500"
                          ? darkMode
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-green-500/10 border border-green-500"
                          : darkMode
                            ? "bg-red-500/20 border border-red-500"
                            : "bg-red-500/10 border border-red-500"
                      }`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.temperature, TEMPERATURA_OPTIMA) === "text-green-500" ? (
                          <span>Óptimo</span>
                        ) : (
                          <span className="flex items-center">
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.temperature ?? 0) < TEMPERATURA_OPTIMA[0]
                              ? "Temperatura baja"
                              : "Temperatura alta"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Humidity Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border mt-6`}
              >
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Droplet size={20} className="mr-2" /> Humedad del Aire
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("humidity")} options={getChartOptions("humidity")} />
                </div>
              </div>

              {/* Humidity Details */}
              <div
                className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border flex flex-col mt-6`}
              >
                <h2 className="text-xl font-mono mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold mb-2 text-blue-400">
                      {sensorData.humidity?.toFixed(1) ?? "--"}
                      <span className="text-2xl">%</span>
                    </div>
                    <div className={darkMode ? "text-gray-400" : "text-gray-500"}>Humedad Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-6`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-blue-400 rounded-full transition-all duration-500"
                      style={{ width: `${sensorData.humidity ?? 0}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_AIRE_OPTIMA[0]}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_AIRE_OPTIMA[1]}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-gray-400" : "text-sm text-gray-500"}>Mínima Óptima</div>
                      <div className="text-xl font-semibold text-blue-400">{HUMEDAD_AIRE_OPTIMA[0]}%</div>
                    </div>
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-gray-400" : "text-sm text-gray-500"}>Máxima Óptima</div>
                      <div className="text-xl font-semibold text-blue-400">{HUMEDAD_AIRE_OPTIMA[1]}%</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${
                        getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-green-500"
                          ? darkMode
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-green-500/10 border border-green-500"
                          : darkMode
                            ? "bg-red-500/20 border border-red-500"
                            : "bg-red-500/10 border border-red-500"
                      }`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.humidity, HUMEDAD_AIRE_OPTIMA) === "text-green-500" ? (
                          <span>Óptimo</span>
                        ) : (
                          <span className="flex items-center">
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.humidity ?? 0) < HUMEDAD_AIRE_OPTIMA[0] ? "Humedad baja" : "Humedad alta"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "water" && (
            <motion.div
              key="water"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Soil Moisture Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Droplet size={20} className="mr-2" /> Humedad del Suelo
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("soil_moisture")} options={getChartOptions("soil_moisture")} />
                </div>
              </div>

              {/* Soil Moisture Details */}
              <div
                className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border flex flex-col`}
              >
                <h2 className="text-xl font-mono mb-4">Detalles</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold mb-2">
                      <span className={getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA)}>
                        {sensorData.soil_moisture?.toFixed(1) ?? "--"}
                      </span>
                      <span className="text-2xl">%</span>
                    </div>
                    <div className={darkMode ? "text-gray-400" : "text-gray-500"}>Humedad Actual</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-6`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${sensorData.soil_moisture ?? 0}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_SUELO_OPTIMA[0]}%` }}
                    ></div>
                    <div
                      className="absolute h-full w-px bg-yellow-500"
                      style={{ left: `${HUMEDAD_SUELO_OPTIMA[1]}%` }}
                    ></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-gray-400" : "text-sm text-gray-500"}>Mínimo Óptimo</div>
                      <div className="text-xl font-semibold">{HUMEDAD_SUELO_OPTIMA[0]}%</div>
                    </div>
                    <div className={`${darkMode ? "bg-gray-800" : "bg-gray-100"} p-3 rounded-lg text-center`}>
                      <div className={darkMode ? "text-sm text-gray-400" : "text-sm text-gray-500"}>Máximo Óptimo</div>
                      <div className="text-xl font-semibold">{HUMEDAD_SUELO_OPTIMA[1]}%</div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div
                      className={`p-3 rounded-lg text-center ${
                        getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-green-500"
                          ? darkMode
                            ? "bg-green-500/20 border border-green-500"
                            : "bg-green-500/10 border border-green-500"
                          : darkMode
                            ? "bg-red-500/20 border border-red-500"
                            : "bg-red-500/10 border border-red-500"
                      }`}
                    >
                      <div className="font-semibold">Estado</div>
                      <div className="flex items-center justify-center mt-1">
                        {getValueColor(sensorData.soil_moisture, HUMEDAD_SUELO_OPTIMA) === "text-green-500" ? (
                          <span>Óptimo</span>
                        ) : (
                          <span className="flex items-center">
                            <AlertTriangle size={16} className="mr-1" />
                            {(sensorData.soil_moisture ?? 0) < HUMEDAD_SUELO_OPTIMA[0]
                              ? "Bajo nivel"
                              : "Nivel excesivo"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* TDS Chart */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border mt-6`}
              >
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Waves size={20} className="mr-2" /> TDS (Sólidos Disueltos)
                </h2>
                <div className="h-[350px]">
                  <Line data={getChartData("tds")} options={getChartOptions("tds")} />
                </div>
              </div>

              {/* Water Level Details */}
              <div
                className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border flex flex-col mt-6`}
              >
                <h2 className="text-xl font-mono mb-4">Nivel de Agua</h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold mb-2 text-purple-400">
                      {sensorData.water_level?.toFixed(0) ?? "--"}
                    </div>
                    <div className={darkMode ? "text-gray-400" : "text-gray-500"}>Valor Analógico</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-6`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-purple-400 rounded-full transition-all duration-500"
                      style={{ width: `${((sensorData.water_level ?? 0) / 1023) * 100}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0</span>
                    <span>512</span>
                    <span>1023</span>
                  </div>

                  <div className="mt-6">
                    <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                      <div className="font-semibold">Información</div>
                      <div className="mt-1 text-sm">
                        El sensor de nivel de agua proporciona un valor analógico entre 0 y 1023, donde valores más
                        altos indican mayor nivel de agua.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "light" && (
            <motion.div
              key="light"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {/* Light Level Card */}
              <div
                className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Sun size={20} className="mr-2" /> Nivel de Luz
                </h2>

                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-center my-6">
                    <div className="text-6xl font-bold mb-2 text-yellow-500">
                      {sensorData.light?.toFixed(0) ?? "--"}
                    </div>
                    <div className={darkMode ? "text-gray-400" : "text-gray-500"}>Intensidad de Luz</div>
                  </div>

                  <div className={`relative h-4 ${darkMode ? "bg-gray-800" : "bg-gray-100"} rounded-full mb-6`}>
                    <div
                      className="absolute left-0 top-0 h-full bg-yellow-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(((sensorData.light ?? 0) / 1000) * 100, 100)}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Oscuro</span>
                    <span>Medio</span>
                    <span>Brillante</span>
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500">
                    <h3 className="font-semibold mb-2">Interpretación</h3>
                    <p className="text-sm">
                      {!sensorData.light
                        ? "Sin datos de luz disponibles"
                        : sensorData.light < 200
                          ? "Nivel de luz bajo. Condiciones de poca iluminación."
                          : sensorData.light < 600
                            ? "Nivel de luz moderado. Iluminación adecuada para la mayoría de plantas."
                            : "Nivel de luz alto. Buena iluminación para plantas que requieren mucha luz."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Color Sensor Card */}
              <div
                className={`${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border`}
              >
                <h2 className="text-xl font-mono mb-4 flex items-center">
                  <Palette size={20} className="mr-2" /> Sensor de Color RGB
                </h2>

                {sensorData.color ? (
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="flex justify-center mb-6">
                      <div
                        className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
                        style={{
                          backgroundColor: `rgb(${sensorData.color.r}, ${sensorData.color.g}, ${sensorData.color.b})`,
                        }}
                      ></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                        <div className="text-sm text-red-500 font-semibold">Rojo</div>
                        <div className="text-xl">{sensorData.color.r}</div>
                      </div>
                      <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                        <div className="text-sm text-green-500 font-semibold">Verde</div>
                        <div className="text-xl">{sensorData.color.g}</div>
                      </div>
                      <div className={`p-3 rounded-lg text-center ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                        <div className="text-sm text-blue-400 font-semibold">Azul</div>
                        <div className="text-xl">{sensorData.color.b}</div>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-gray-800">
                      <h3 className="font-semibold mb-2">Código Hexadecimal</h3>
                      <div className="flex items-center justify-between">
                        <code className="bg-gray-900 p-2 rounded text-white">
                          #{sensorData.color.r.toString(16).padStart(2, "0")}
                          {sensorData.color.g.toString(16).padStart(2, "0")}
                          {sensorData.color.b.toString(16).padStart(2, "0")}
                        </code>
                        <button
                          className={`px-3 py-1 rounded-md ${darkMode ? "bg-green-500/20 hover:bg-green-500/30 border-green-500" : "bg-green-500/10 hover:bg-green-500/20 border-green-500"} border`}
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `#${sensorData.color.r.toString(16).padStart(2, "0")}${sensorData.color.g
                                .toString(16)
                                .padStart(2, "0")}${sensorData.color.b.toString(16).padStart(2, "0")}`,
                            )
                          }}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-64">
                    <p className="text-gray-400">No hay datos de color disponibles</p>
                  </div>
                )}
              </div>

              {/* System Info */}
              <div
                className={`lg:col-span-2 ${darkMode ? "bg-gray-900 border-green-500/30" : "bg-white border-gray-200 shadow-sm"} rounded-lg p-4 border mt-6`}
              >
                <div className="flex items-center mb-4">
                  <Info size={20} className="mr-2" />
                  <h2 className="text-xl font-mono">Información del Sistema</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Estado de Conexión</h3>
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full ${getStatusIndicator()} mr-2 animate-pulse`}></div>
                      <span>{isConnected ? "Conectado" : "Desconectado"}</span>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Última Actualización</h3>
                    <div>{formatLastUpdate()}</div>
                  </div>

                  <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Datos Recopilados</h3>
                    <div>{dataLogRef.current.length} registros</div>
                  </div>

                  <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                    <h3 className="text-sm font-semibold mb-2">Broker MQTT</h3>
                    <div className="text-xs truncate">{MQTT_BROKER}</div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => setShowExportPanel(!showExportPanel)}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md ${darkMode ? "bg-green-500/20 hover:bg-green-500/30 border-green-500" : "bg-green-500/10 hover:bg-green-500/20 border-green-500"} border`}
                  >
                    <Download size={16} />
                    Exportar Datos
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

