#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// Configuración WiFi
const char* ssid = "Tu_SSID";   // Reemplaza con tu red WiFi
const char* password = "Tu_PASSWORD";

// Configuración MQTT
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 8883;
const char* mqtt_topic = "sensor/humedad";

// Definir el cliente WiFi y MQTT
WiFiClientSecure espClient;
PubSubClient client(espClient);

// Pin del sensor de humedad
const int pinHumedad = 34; // Ajusta según tu hardware

void setup() {
  Serial.begin(115200);
  setupWiFi();
  setupMQTT();
}

void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  enviarDatos();
  delay(5000); // Enviar datos cada 5 segundos
}

void setupWiFi() {
  Serial.print("Conectando a WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConectado a WiFi");
  espClient.setInsecure(); // Permite conexiones sin verificación de certificados
}

void setupMQTT() {
  client.setServer(mqtt_server, mqtt_port);
}

void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Conectando a MQTT...");
    if (client.connect("ArduinoClient")) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Error, código: ");
      Serial.print(client.state());
      Serial.println(" Reintentando en 5 segundos...");
      delay(5000);
    }
  }
}

void enviarDatos() {
  int valorHumedad = analogRead(pinHumedad);
  float humedad = map(valorHumedad, 0, 4095, 0, 100); // Escalar a porcentaje

  char mensaje[50];
  snprintf(mensaje, 50, "{\"humedad\": %.2f}", humedad);

  client.publish(mqtt_topic, mensaje);
  Serial.print("Datos enviados: ");
  Serial.println(mensaje);
}
