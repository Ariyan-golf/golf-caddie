-- Add start hole, weather, wind speed, and wind direction columns to rounds

ALTER TABLE public.rounds
  ADD COLUMN start_hole integer NOT NULL DEFAULT 1
    CONSTRAINT rounds_start_hole_check CHECK (start_hole IN (1, 10)),
  ADD COLUMN weather text
    CONSTRAINT rounds_weather_check CHECK (weather IN ('晴れ', '曇り', '小雨', '雨')),
  ADD COLUMN wind_speed text
    CONSTRAINT rounds_wind_speed_check CHECK (wind_speed IN ('無風', '微風', '普通', '強風')),
  ADD COLUMN wind_direction text
    CONSTRAINT rounds_wind_direction_check CHECK (wind_direction IN ('北', '東', '南', '西', '北東', '北西', '南東', '南西'));
