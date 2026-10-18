#include <WiFi.h>
#include <WebServer.h>

// Replace these with the Wi-Fi network your phone and ESP32 will share.
const char* WIFI_NAME = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Connect a capacitive moisture sensor's analog output to GPIO 34.
const int MOISTURE_PIN = 34;

// Calibrate these values for your sensor:
// read and record the value in dry air, then the value in damp soil.
const int DRY_READING = 3200;
const int WET_READING = 1400;

WebServer server(80);

int readMoisturePercent() {
  const int raw = analogRead(MOISTURE_PIN);
  const int percent = map(raw, DRY_READING, WET_READING, 0, 100);
  return constrain(percent, 0, 100);
}

void handleStatus() {
  const int moisture = readMoisturePercent();
  String response = "{\"moisturePercent\":";
  response += String(moisture);
  response += "}";
  server.send(200, "application/json", response);
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(MOISTURE_PIN, INPUT);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NAME, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Sprout address: http://");
  Serial.println(WiFi.localIP());

  server.on("/api/status", HTTP_GET, handleStatus);
  server.begin();
  Serial.println("Sprout sensor ready.");
}

void loop() {
  server.handleClient();
}
