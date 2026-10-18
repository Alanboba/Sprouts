#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include "plant_frames.h"

#define TFT_CS   5
#define TFT_DC   16
#define TFT_RST  17
#define TFT_SCLK 18
#define TFT_MOSI 23

Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);

const int SCALE = 2;
const int IMAGE_W = PLANT_FRAME_W * SCALE;
const int IMAGE_H = PLANT_FRAME_H * SCALE;

const int START_X = (240 - IMAGE_W) / 2;
const int START_Y = (280 - IMAGE_H) / 2;

const int FRAME_DELAY_MS = 500;

// Only one line of enlarged pixels is stored in RAM.
uint16_t scaledLine[IMAGE_W];

void setup() {
  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);

  tft.init(240, 280);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_BLACK);
}

void loop() {
  for (int frame = 0; frame < PLANT_FRAME_COUNT; frame++) {
    for (int y = 0; y < PLANT_FRAME_H; y++) {

      // Expand one source row horizontally.
      for (int x = 0; x < PLANT_FRAME_W; x++) {
        uint16_t color = pgm_read_word(
          &plantFrames[frame][y * PLANT_FRAME_W + x]
        );

        scaledLine[x * SCALE] = color;
        scaledLine[x * SCALE + 1] = color;
      }

      // Draw this row twice to scale vertically.
      tft.drawRGBBitmap(
        START_X, START_Y + y * SCALE,
        scaledLine, IMAGE_W, 1
      );

      tft.drawRGBBitmap(
        START_X, START_Y + y * SCALE + 1,
        scaledLine, IMAGE_W, 1
      );
    }

    delay(FRAME_DELAY_MS);
  }
}
