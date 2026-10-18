int sensorPin = 34;
int sensorValue = 0;
int prevValue = -1;

const int AirValue = 3200;
const int WaterValue = 1290;


void setup() {
  Serial.begin(9600);
}

void loop() {
  sensorValue = analogRead(sensorPin);

  int friendlyValue = map(sensorValue, AirValue, WaterValue, 0, 100);
  friendlyValue = constrain(friendlyValue, 0, 100);

  if (sensorValue != prevValue) {
    Serial.print("sensor = ");
    Serial.print(sensorValue);
    Serial.print(" - percentage = ");
    Serial.println(friendlyValue);
    prevValue = sensorValue;
  }
  delay(500);
}