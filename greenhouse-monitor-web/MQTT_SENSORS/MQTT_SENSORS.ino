// Librería del MKR IoT Carrier para manejar sensores y actuadores integrados
#include <Arduino_MKRIoTCarrier.h>

// Librerías para WiFi y MQTT
#include <WiFiNINA.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

MKRIoTCarrier carrier;

// Pines de conexión para los sensores externos
#define PIN_TDS A6               // Sensor TDS (Total de Sólidos Disueltos) conectado al pin analógico A6
#define PIN_SOIL_MOISTURE A0     // Sensor de humedad de suelo capacitivo conectado al pin analógico A0
#define PIN_WATER_LEVEL A1       // Sensor de nivel de agua (Octopus Water Level Sensor) conectado al pin analógico A1

// Variables para almacenar las lecturas de los sensores externos
float tdsValue = 0;             // Valor de TDS en ppm (partes por millón)
int soilMoistureValue = 0;      // Humedad del suelo en porcentaje
int waterLevelValue = 0;        // Nivel de agua como valor analógico

// Variables para las lecturas de los sensores del MKR IoT Carrier
float temperature = 0;          // Temperatura en grados Celsius
float humidity = 0;             // Humedad relativa en porcentaje
float pressure = 0;             // Presión atmosférica en hPa
int red = 0, green = 0, blue = 0, lightLevel = 0; // Valores de color RGB y luz ambiental

// Configuración WiFi
const char* ssid = "CLX";
const char* password = "123456789";

// Configuración MQTT
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic = "invernadero/sensores";
const char* mqtt_client_id = "MKRIoTCarrier";

// Objetos para WiFi y MQTT
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Variables para control de tiempo - OPTIMIZADAS PARA TIEMPO REAL
unsigned long lastReadingTime = 0;
unsigned long lastMqttPublishTime = 0;
unsigned long lastDisplayUpdateTime = 0;
const long readingInterval = 500;       // Intervalo para leer sensores (500ms)
const long mqttPublishInterval = 1000;  // Intervalo para publicar en MQTT (1 segundo)
const long displayUpdateInterval = 500; // Intervalo para actualizar display (500ms)

// Variables para la interfaz
int currentScreen = 0;
const int numScreens = 3;
bool wifiConnected = false;
bool mqttConnected = false;

// Variables para optimización
bool sensorsUpdated = false;
unsigned long lastButtonCheckTime = 0;
const long buttonCheckInterval = 100;  // Verificar botones cada 100ms

void setup() {
  Serial.begin(115200); // Aumentado a 115200 para comunicación más rápida
  delay(500);        // Reducido a 500ms

  Serial.println("Iniciando sistema de monitoreo...");

  // Inicializar el MKR IoT Carrier
  if (!carrier.begin()) {
    Serial.println("Error al iniciar el MKR IoT Carrier.");
    while (1); // Se detiene en caso de error
  }

  // Inicializar el sensor de luz y color
  if (!carrier.Light.begin()) {
    Serial.println("Error al iniciar el sensor de luz y color.");
    while (1); // Se detiene en caso de error
  }

  // Configurar el display
  carrier.display.setRotation(0);
  carrier.display.fillScreen(ST77XX_BLACK);
  carrier.display.setTextSize(2);
  carrier.display.setTextColor(ST77XX_GREEN);
  carrier.display.setCursor(20, 100);
  carrier.display.println("Iniciando...");
  
  // Conectar a WiFi
  setupWiFi();
  
  // Configurar MQTT
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  
  // Leer sensores inmediatamente al inicio
  readAllSensors();
  updateDisplay();
  
  Serial.println("Sistema iniciado correctamente.");
}

void loop() {
  unsigned long currentMillis = millis();
  
  // Actualizar estado de MQTT - Optimizado para reconexión rápida
  if (wifiConnected && !mqttClient.connected()) {
    reconnectMQTT();
  }
  
  if (mqttClient.connected()) {
    mqttClient.loop();
    mqttConnected = true;
  } else {
    mqttConnected = false;
  }
  
  // Leer sensores en intervalos
  if (currentMillis - lastReadingTime >= readingInterval) {
    lastReadingTime = currentMillis;
    readAllSensors();
    sensorsUpdated = true;
  }
  
  // Publicar datos en MQTT en intervalos
  if (wifiConnected && mqttConnected && currentMillis - lastMqttPublishTime >= mqttPublishInterval) {
    lastMqttPublishTime = currentMillis;
    publishSensorData();
  }
  
  // Actualizar display solo cuando hay nuevos datos o cambios
  if ((sensorsUpdated || currentMillis - lastDisplayUpdateTime >= displayUpdateInterval)) {
    lastDisplayUpdateTime = currentMillis;
    updateDisplay();
    sensorsUpdated = false;
  }
  
  // Comprobar botones táctiles con frecuencia optimizada
  if (currentMillis - lastButtonCheckTime >= buttonCheckInterval) {
    lastButtonCheckTime = currentMillis;
    checkButtons();
  }
}

void setupWiFi() {
  Serial.print("Conectando a WiFi...");
  carrier.display.fillScreen(ST77XX_BLACK);
  carrier.display.setTextSize(2);
  carrier.display.setTextColor(ST77XX_YELLOW);
  carrier.display.setCursor(20, 100);
  carrier.display.println("Conectando WiFi");
  
  WiFi.begin(ssid, password);
  
  // Optimizado: Reducir tiempo de espera entre intentos
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(300);  // Reducido a 300ms
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado");
    Serial.print("Dirección IP: ");
    Serial.println(WiFi.localIP());
    wifiConnected = true;
    
    carrier.display.fillScreen(ST77XX_BLACK);
    carrier.display.setTextColor(ST77XX_GREEN);
    carrier.display.setCursor(20, 100);
    carrier.display.println("WiFi Conectado");
    delay(500);  // Reducido a 500ms
  } else {
    Serial.println("\nFalló la conexión WiFi");
    wifiConnected = false;
    
    carrier.display.fillScreen(ST77XX_BLACK);
    carrier.display.setTextColor(ST77XX_RED);
    carrier.display.setCursor(20, 100);
    carrier.display.println("Error WiFi");
    delay(500);  // Reducido a 500ms
  }
}

void reconnectMQTT() {
  // Intentar reconectar al broker MQTT - Optimizado para reconexión rápida
  if (mqttClient.connect(mqtt_client_id)) {
    Serial.println("Conectado al broker MQTT");
    mqttClient.subscribe(mqtt_topic);
  } else {
    Serial.print("Falló conexión MQTT, rc=");
    Serial.println(mqttClient.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Procesar mensajes recibidos del broker MQTT
  Serial.print("Mensaje recibido [");
  Serial.print(topic);
  Serial.print("]: ");
  
  char message[length + 1];
  for (unsigned int i = 0; i < length; i++) {
    message[i] = (char)payload[i];
    Serial.print((char)payload[i]);
  }
  message[length] = '\0';
  Serial.println();
  
  // Aquí puedes procesar comandos recibidos si es necesario
}

void readAllSensors() {
  // Optimizado: Lectura más eficiente de sensores
  
  // Lectura del sensor TDS y conversión simulada a ppm
  tdsValue = analogRead(PIN_TDS);
  tdsValue = (tdsValue / 1024.0) * 5.0 * 1000; // Simulación de conversión a ppm
  
  // Lectura y mapeo de la humedad del suelo a porcentaje
  soilMoistureValue = analogRead(PIN_SOIL_MOISTURE);
  soilMoistureValue = map(soilMoistureValue, 1023, 0, 0, 100);  
  
  // Lectura del nivel de agua en valor analógico
  waterLevelValue = analogRead(PIN_WATER_LEVEL);
  
  // Lecturas de los sensores ambientales del MKR IoT Carrier
  temperature = carrier.Env.readTemperature();
  humidity = carrier.Env.readHumidity();
  pressure = carrier.Pressure.readPressure(); // Lectura directa del sensor de presión
  
  // Lectura de luz y color
  if (carrier.Light.colorAvailable()) {
    carrier.Light.readColor(red, green, blue, lightLevel);
  }
  
  // Mostrar lecturas en consola solo cada 10 lecturas para no saturar el puerto serie
  static int readCount = 0;
  if (++readCount >= 10) {
    readCount = 0;
    Serial.println("------------------------------");
    Serial.print("TDS (ppm): ");
    Serial.println(tdsValue);
    Serial.print("Humedad del suelo (%): ");
    Serial.println(soilMoistureValue);
    Serial.print("Nivel de agua (valor analógico): ");
    Serial.println(waterLevelValue);
    Serial.print("Temperatura (°C): ");
    Serial.println(temperature);
    Serial.print("Humedad relativa (%): ");
    Serial.println(humidity);
    Serial.print("Presión atmosférica (hPa): ");
    Serial.println(pressure);
    Serial.print("Nivel de luz: ");
    Serial.println(lightLevel);
    Serial.print("Color RGB - R: ");
    Serial.print(red);
    Serial.print(" G: ");
    Serial.print(green);
    Serial.print(" B: ");
    Serial.println(blue);
  }
}

void publishSensorData() {
  // Optimizado: Usar un buffer más pequeño y eficiente
  StaticJsonDocument<384> jsonDoc;
  
  // Añadir datos de sensores externos
  jsonDoc["tds"] = tdsValue;
  jsonDoc["soil_moisture"] = soilMoistureValue;
  jsonDoc["water_level"] = waterLevelValue;
  
  // Añadir datos de sensores del MKR IoT Carrier
  jsonDoc["temperature"] = temperature;
  jsonDoc["humidity"] = humidity;
  jsonDoc["pressure"] = pressure;
  jsonDoc["light"] = lightLevel;
  
  // Añadir datos de color
  JsonObject colorObj = jsonDoc.createNestedObject("color");
  colorObj["r"] = red;
  colorObj["g"] = green;
  colorObj["b"] = blue;
  
  // Serializar a JSON
  char jsonBuffer[384];
  serializeJson(jsonDoc, jsonBuffer);
  
  // Publicar en MQTT
  if (mqttClient.publish(mqtt_topic, jsonBuffer)) {
    // Éxito silencioso para no saturar el puerto serie
  } else {
    Serial.println("Error al publicar");
  }
}

void checkButtons() {
  // Actualizar estado de los botones - Optimizado para respuesta rápida
  carrier.Buttons.update();
  
  // Cambiar pantalla con los botones
  if (carrier.Buttons.getTouch(TOUCH0)) {
    currentScreen = (currentScreen - 1 + numScreens) % numScreens;
    sensorsUpdated = true; // Forzar actualización de pantalla
    delay(150); // Debounce reducido
  }
  
  if (carrier.Buttons.getTouch(TOUCH4)) {
    currentScreen = (currentScreen + 1) % numScreens;
    sensorsUpdated = true; // Forzar actualización de pantalla
    delay(150); // Debounce reducido
  }
  
  // Botón central para reconectar
  if (carrier.Buttons.getTouch(TOUCH2)) {
    if (!wifiConnected) {
      setupWiFi();
    } else if (!mqttConnected) {
      reconnectMQTT();
    }
    sensorsUpdated = true; // Forzar actualización de pantalla
    delay(150); // Debounce reducido
  }
}

void updateDisplay() {
  // Optimizado: Actualización más eficiente de la pantalla
  carrier.display.fillScreen(ST77XX_BLACK);
  
  // Encabezado común
  carrier.display.setTextSize(1);
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(5, 5);
  carrier.display.print("INVERNADERO MONITOR");
  
  // Línea separadora
  carrier.display.drawLine(0, 20, 240, 20, ST77XX_GREEN);
  
  // Estado de conexión
  carrier.display.setCursor(5, 230);
  if (wifiConnected) {
    carrier.display.setTextColor(ST77XX_GREEN);
    carrier.display.print("WiFi: OK");
  } else {
    carrier.display.setTextColor(ST77XX_RED);
    carrier.display.print("WiFi: NO");
  }
  
  carrier.display.setCursor(100, 230);
  if (mqttConnected) {
    carrier.display.setTextColor(ST77XX_GREEN);
    carrier.display.print("MQTT: OK");
  } else {
    carrier.display.setTextColor(ST77XX_RED);
    carrier.display.print("MQTT: NO");
  }
  
  // Mostrar contenido según la pantalla actual
  switch (currentScreen) {
    case 0:
      displayEnvironmentalSensors();
      break;
    case 1:
      displayWaterSensors();
      break;
    case 2:
      displayColorSensor();
      break;
  }
}

void displayEnvironmentalSensors() {
  carrier.display.setTextSize(1);
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 30);
  carrier.display.println("SENSORES AMBIENTALES");
  
  // Temperatura
  carrier.display.setCursor(10, 50);
  carrier.display.print("Temperatura: ");
  carrier.display.setTextColor(ST77XX_YELLOW);
  carrier.display.print(temperature, 1);
  carrier.display.println(" C");
  
  // Humedad
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 70);
  carrier.display.print("Humedad: ");
  carrier.display.setTextColor(ST77XX_CYAN);
  carrier.display.print(humidity, 1);
  carrier.display.println(" %");
  
  // Presión
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 90);
  carrier.display.print("Presion: ");
  carrier.display.setTextColor(ST77XX_MAGENTA);
  carrier.display.print(pressure, 1);
  carrier.display.println(" hPa");
  
  // Luz
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 110);
  carrier.display.print("Luz: ");
  carrier.display.setTextColor(ST77XX_GREEN);
  carrier.display.println(lightLevel);
  
  // Humedad del suelo
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 130);
  carrier.display.print("Humedad suelo: ");
  carrier.display.setTextColor(ST77XX_BLUE);
  carrier.display.print(soilMoistureValue);
  carrier.display.println(" %");
  
  // Barra de humedad del suelo
  carrier.display.drawRect(10, 150, 220, 15, ST77XX_WHITE);
  int soilBarWidth = map(soilMoistureValue, 0, 100, 0, 218);
  carrier.display.fillRect(11, 151, soilBarWidth, 13, ST77XX_BLUE);
  
  // Instrucciones
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 180);
  carrier.display.println("< Anterior    Siguiente >");
  carrier.display.setCursor(10, 200);
  carrier.display.println("Centro: Reconectar");
}

void displayWaterSensors() {
  carrier.display.setTextSize(1);
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 30);
  carrier.display.println("SENSORES DE AGUA");
  
  // TDS
  carrier.display.setCursor(10, 60);
  carrier.display.print("TDS: ");
  carrier.display.setTextColor(ST77XX_CYAN);
  carrier.display.print(tdsValue, 1);
  carrier.display.println(" ppm");
  
  // Barra de TDS
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.drawRect(10, 80, 220, 15, ST77XX_WHITE);
  int tdsBarWidth = map(constrain(tdsValue, 0, 1000), 0, 1000, 0, 218);
  carrier.display.fillRect(11, 81, tdsBarWidth, 13, ST77XX_CYAN);
  
  // Nivel de agua
  carrier.display.setCursor(10, 110);
  carrier.display.print("Nivel agua: ");
  carrier.display.setTextColor(ST77XX_BLUE);
  carrier.display.println(waterLevelValue);
  
  // Barra de nivel de agua
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.drawRect(10, 130, 220, 15, ST77XX_WHITE);
  int waterBarWidth = map(constrain(waterLevelValue, 0, 1023), 0, 1023, 0, 218);
  carrier.display.fillRect(11, 131, waterBarWidth, 13, ST77XX_BLUE);
  
  // Instrucciones
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 180);
  carrier.display.println("< Anterior    Siguiente >");
  carrier.display.setCursor(10, 200);
  carrier.display.println("Centro: Reconectar");
}

void displayColorSensor() {
  carrier.display.setTextSize(1);
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 30);
  carrier.display.println("SENSOR DE COLOR");
  
  // Valores RGB
  carrier.display.setCursor(10, 60);
  carrier.display.print("Rojo: ");
  carrier.display.setTextColor(ST77XX_RED);
  carrier.display.println(red);
  
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 80);
  carrier.display.print("Verde: ");
  carrier.display.setTextColor(ST77XX_GREEN);
  carrier.display.println(green);
  
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 100);
  carrier.display.print("Azul: ");
  carrier.display.setTextColor(ST77XX_BLUE);
  carrier.display.println(blue);
  
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 120);
  carrier.display.print("Luz: ");
  carrier.display.setTextColor(ST77XX_YELLOW);
  carrier.display.println(lightLevel);
  
  // Mostrar el color detectado
  uint16_t detectedColor = carrier.display.color565(
    constrain(map(red, 0, 255, 0, 255), 0, 255),
    constrain(map(green, 0, 255, 0, 255), 0, 255),
    constrain(map(blue, 0, 255, 0, 255), 0, 255)
  );
  
  carrier.display.drawRect(150, 60, 70, 70, ST77XX_WHITE);
  carrier.display.fillRect(151, 61, 68, 68, detectedColor);
  
  // Instrucciones
  carrier.display.setTextColor(ST77XX_WHITE);
  carrier.display.setCursor(10, 180);
  carrier.display.println("< Anterior    Siguiente >");
  carrier.display.setCursor(10, 200);
  carrier.display.println("Centro: Reconectar");
}