#!/bin/bash
# Renders the comparison camera angles (same as docs/screenshots/before_*.png).
cd "$(dirname "$0")/.."
OUT=${1:-test-output}
S="http://localhost:5173/?preview=1&still=1&weather=clear"
node scripts/shot.mjs "$S&hour=9&x=-110&y=1.7&z=-101.6&tx=0&tz=-100&ty=3" $OUT/after_bazaar.png 500
node scripts/shot.mjs "$S&hour=9&x=-70&y=1.7&z=4&tx=40&tz=-2&ty=4" $OUT/after_tilak.png 500
node scripts/shot.mjs "$S&hour=10&x=60&y=48&z=40&tx=0&tz=-40" $OUT/after_aerial.png 500
node scripts/shot.mjs "$S&hour=11&x=-114&y=1.9&z=4.5&tx=-117&tz=-3&ty=0.7&showcase=vehicles&fov=50" $OUT/vehicles_bikes.png 500
node scripts/shot.mjs "$S&hour=11&x=-100&y=2.0&z=5&tx=-100&tz=-3&ty=0.8&showcase=vehicles&fov=55" $OUT/vehicles_cars.png 500
echo ALL_DONE
node scripts/shot.mjs "http://localhost:5173/?preview=1&still=1&weather=heavy_rain&rain=1&hour=20.5&x=-110&y=1.7&z=-101.6&tx=0&tz=-100&ty=3" $OUT/after_bazaar_night_rain.png 500
echo NIGHT_DONE
