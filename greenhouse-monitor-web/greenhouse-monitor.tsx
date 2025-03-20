"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Line } from "react-chartjs-2"
import mqtt from "mqtt"
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

// MQTT Configuration
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt"
const MQTT_TOPIC = "sensor/humedad"

// Optimal parameters for the greenhouse
const TIEMPO_MAX = 30 // Maximum number of points in the graph
const PH_OPTIMO = [5.5, 6.5]
const HUMEDAD_OPTIMA = [20, 60]

interface SensorData {
  humedad?: number
  ph?: number
  temperatura?: number
  co2?: number
  voc?: number
  bateria?: number
  turbidez?: number
  calidad_agua?: string
}

const GreenhouseMonitor: React.FC = () => {
  const [sensorData, setSensorData] = useState<SensorData>({})
  const [humidityHistory, setHumidityHistory] = useState<number[]>([])
  const [timeHistory, setTimeHistory] = useState<number[]>([])
  const [statusMessage, setStatusMessage] = useState("Waiting for connection...")
  const clientRef = useRef<mqtt.MqttClient | null>(null)

  useEffect(() => {
    clientRef.current = mqtt.connect(MQTT_BROKER)

    clientRef.current.on("connect", () => {
      setStatusMessage("Connected to MQTT")
      clientRef.current?.subscribe(MQTT_TOPIC)
    })

    clientRef.current.on("message", (topic, message) => {
      try {
        const data: SensorData = JSON.parse(message.toString())
        setSensorData((prevData) => ({ ...prevData, ...data }))

        if (typeof data.humedad === "number") {
          setHumidityHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), data.humedad])
          setTimeHistory((prev) => [...prev.slice(-TIEMPO_MAX + 1), prev.length])
        }
      } catch (error) {
        setStatusMessage("Error processing data")
      }
    })

    return () => {
      clientRef.current?.end()
    }
  }, [])

  const chartData = {
    labels: timeHistory,
    datasets: [
      {
        label: "Soil Humidity",
        data: humidityHistory,
        borderColor: "rgb(0, 255, 0)",
        backgroundColor: "rgba(0, 255, 0, 0.5)",
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: "Soil Humidity Over Time",
      },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
      },
    },
  }

  const getColor = (value: number, [min, max]: number[]) =>
    value >= min && value <= max ? "text-green-500" : "text-red-500"

  return (
    <div className="min-h-screen bg-black text-green-500 p-8">
      <h1 className="text-3xl font-bold mb-6">Greenhouse Sensor Monitor</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Sensor Readings</h2>
          <div className="space-y-2">
            <p>Temperature: {sensorData.temperatura?.toFixed(1) ?? "--"} °C</p>
            <p>Air Humidity: {sensorData.humedad?.toFixed(1) ?? "--"}%</p>
            <p>CO₂: {sensorData.co2?.toFixed(0) ?? "--"} ppm</p>
            <p>VOC: {sensorData.voc?.toFixed(2) ?? "--"}</p>
            <p>Battery: {sensorData.bateria?.toFixed(2) ?? "--"} V</p>
            <p className={getColor(sensorData.humedad ?? 0, HUMEDAD_OPTIMA)}>
              Soil Humidity: {sensorData.humedad?.toFixed(1) ?? "--"}%
            </p>
            <p className={getColor(sensorData.ph ?? 0, PH_OPTIMO)}>pH: {sensorData.ph?.toFixed(2) ?? "--"}</p>
            <p>Turbidity: {sensorData.turbidez?.toFixed(1) ?? "--"} NTU</p>
            <p>Water Quality: {sensorData.calidad_agua ?? "--"}</p>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Soil Humidity Chart</h2>
          <Line options={chartOptions} data={chartData} />
        </div>
      </div>

      <div className="mt-8 p-2 bg-gray-800 text-green-500">Status: {statusMessage}</div>
    </div>
  )
}

export default GreenhouseMonitor

