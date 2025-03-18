"use client"

import { useEffect, useState } from "react"
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
} from "chart.js"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

// Constants
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt"
const MQTT_TOPIC = "sensor/humedad"
const TIEMPO_MAX = 30
const PH_OPTIMO: [number, number] = [5.5, 6.5]
const HUMEDAD_OPTIMA: [number, number] = [20, 60]

interface SensorData {
  temperatura?: number
  humedad?: number
  co2?: number
  voc?: number
  bateria?: number
  ph?: number
  turbidez?: number
  calidad_agua?: string
}

export default function GreenhouseMonitor() {
  const [sensorData, setSensorData] = useState<SensorData>({})
  const [humidityHistory, setHumidityHistory] = useState<number[]>([])
  const [timeHistory, setTimeHistory] = useState<number[]>([])
  const [status, setStatus] = useState("Esperando conexión...")

  useEffect(() => {
    const client = mqtt.connect(MQTT_BROKER)

    client.on("connect", () => {
      setStatus("Conectado a MQTT")
      client.subscribe(MQTT_TOPIC)
    })

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString())
        setSensorData((prev) => ({ ...prev, ...data }))

        if (typeof data.humedad === "number") {
          setHumidityHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), data.humedad])
          setTimeHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), prev.length])
        }
      } catch (error) {
        setStatus("Error al procesar datos")
      }
    })

    return () => {
      client.end()
    }
  }, [])

  const chartData = {
    labels: timeHistory,
    datasets: [
      {
        label: "Humedad del Suelo",
        data: humidityHistory,
        borderColor: "#00FF00",
        backgroundColor: "rgba(0, 255, 0, 0.1)",
        tension: 0.1,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        grid: {
          color: "#555555",
        },
        ticks: {
          color: "#FFFFFF",
        },
      },
      x: {
        grid: {
          color: "#555555",
        },
        ticks: {
          color: "#FFFFFF",
        },
      },
    },
    plugins: {
      legend: {
        labels: {
          color: "#FFFFFF",
        },
      },
    },
  }

  const getValueColor = (value: number, [min, max]: number[]) =>
    value >= min && value <= max ? "text-green-500" : "text-red-500"

  return (
    <div className="min-h-screen bg-black p-8">
      <h1 className="text-3xl font-mono text-green-500 mb-8">Monitor de Sensores del Invernadero</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-mono text-green-500 mb-4">Sensor Readings</h2>
          <div className="space-y-2 font-mono">
            <p className="text-green-500">Temperatura: {sensorData.temperatura ?? "--"} °C</p>
            <p className="text-green-500">Humedad Aire: {sensorData.humedad ?? "--"}%</p>
            <p className="text-green-500">CO₂: {sensorData.co2 ?? "--"} ppm</p>
            <p className="text-green-500">VOC: {sensorData.voc ?? "--"}</p>
            <p className="text-green-500">Batería: {sensorData.bateria ?? "--"} V</p>
            <p className={getValueColor(sensorData.humedad ?? 0, HUMEDAD_OPTIMA)}>
              Humedad Suelo: {sensorData.humedad ?? "--"}%
            </p>
            <p className={getValueColor(sensorData.ph ?? 0, PH_OPTIMO)}>pH: {sensorData.ph ?? "--"}</p>
            <p className="text-green-500">Turbidez: {sensorData.turbidez ?? "--"} NTU</p>
            <p className="text-green-500">Calidad del Agua: {sensorData.calidad_agua ?? "--"}</p>
          </div>
        </div>

        <div className="h-[400px]">
          <h2 className="text-xl font-mono text-green-500 mb-4">Soil Humidity Chart</h2>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-green-500 p-2 font-mono">Status: {status}</div>
    </div>
  )
}

