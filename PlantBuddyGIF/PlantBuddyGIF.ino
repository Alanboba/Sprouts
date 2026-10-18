#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include "plant_frames.h"
#include "plant_lovey.h"
#include "plant_lotswater.h"
#include "plant_littlewater.h"
#include "plant_wobbling.h"
#include "plant_almostdead.h"
#include "plant_dead.h"

#define TFT_CS   5
#define TFT_DC   16
#define TFT_RST  17
#define TFT_SCLK 18
#define TFT_MOSI 23
#define SOIL_PIN 34

Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
const int DRY_THRESHOLD = 2500; // Calibrate using Serial Monitor
const int WATER_VAL = 1590;
const int SCALE = 10;            // 24x24 source becomes 120x120 on screen
const int DISPLAY_W = 240;
const int DISPLAY_H = 280;
const int FRAME_DELAY_MS = 200;
uint16_t scaledLine[240];
bool previousDryState = false;
bool firstRun = true;

bool isSoilDry() {
  int reading = analogRead(SOIL_PIN);
  return reading <= DRY_THRESHOLD;
}

void drawFrame(const uint16_t* frame, int width, int height) {
  int drawWidth = width * SCALE;
  int drawHeight = height * SCALE;
  int startX = (DISPLAY_W - drawWidth) / 2;
  int startY = (DISPLAY_H - drawHeight) / 2;
  for (int y = 0; y < height; y++) {
    int out = 0;
    for (int x = 0; x < width; x++) {
      uint16_t color = pgm_read_word(&frame[y * width + x]);
      for (int k = 0; k < SCALE; k++) scaledLine[out++] = color;
    }
    tft.startWrite();
    for (int k = 0; k < SCALE; k++) {
      tft.setAddrWindow(startX, startY + y * SCALE + k, drawWidth, 1);
      for (int x = 0; x < drawWidth; x++) tft.writeColor(scaledLine[x], 1);
    }
    tft.endWrite();
  }
}

template <size_t FRAME_COUNT, size_t FRAME_PIXELS>
template <size_t FRAME_COUNT, size_t FRAME_PIXELS>
void playAnimation(
  const uint16_t (&frames)[FRAME_COUNT][FRAME_PIXELS],
  int width,
  int height,
  bool animationIsForDrySoil
) {
  for (size_t frame = 0; frame < FRAME_COUNT; frame++) {
    drawFrame(&frames[frame][0], width, height);
    delay(FRAME_DELAY_MS);
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 280);
  tft.setRotation(0);
  tft.fillScreen(0xE6F8); // pale cream background
  Serial.println("Plant Buddy started!");
  Serial.println("Checking soil moisture...");
}

void loop() {
  int moisture = analogRead(SOIL_PIN);

  int percentage = constrain(
    map(moisture, 3200, WATER_VAL, 0, 100),
    0, 100
  );

  Serial.print("Raw reading: ");
  Serial.print(moisture);
  Serial.print(" | Moisture: ");
  Serial.print(percentage);
  Serial.println("%");

  if (percentage > 80) {
    playAnimation(plantLotsWaterFrames, LOTSWATER_FRAME_W, LOTSWATER_FRAME_H, true);
  }
  else if (percentage > 65) {
    playAnimation(plantLovelyFrames, LOVELY_FRAME_W, LOVELY_FRAME_H, true);
  }
  else if (percentage > 45) {
    playAnimation(plantFrames, PLANT_FRAME_W, PLANT_FRAME_H, true);
  }
  else if (percentage > 30) {
    playAnimation(plantLittleWaterFrames, LITTLEWATER_FRAME_W, LITTLEWATER_FRAME_H, true);
  }
  else if (percentage > 20) {
    playAnimation(plantWobblingFrames, WOBBLING_FRAME_W, WOBBLING_FRAME_H, true);
  }
  else if (percentage > 5) {
    playAnimation(plantAlmostDeadFrames, ALMOSTDEAD_FRAME_W, ALMOSTDEAD_FRAME_H, true);
  }
  else {
    playAnimation(plantDeadFrames, PLANT_DEAD_FRAME_W, PLANT_DEAD_FRAME_H, true);
  }

  delay(100);
}
