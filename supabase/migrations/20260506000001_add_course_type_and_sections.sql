-- ① golf_courses に course_type を追加
ALTER TABLE golf_courses
  ADD COLUMN course_type TEXT NOT NULL DEFAULT '18H'
    CHECK (course_type IN ('18H', '27H', '36H'));

-- ② course_holes に course_section を追加
--   18H は空文字列、27H は 'A'/'B'/'C'、36H は '東'/'西' など
ALTER TABLE course_holes
  ADD COLUMN course_section TEXT NOT NULL DEFAULT '';

-- 既存の UNIQUE 制約を削除して course_section を含む制約に置換
ALTER TABLE course_holes
  DROP CONSTRAINT IF EXISTS course_holes_course_id_hole_number_key;

ALTER TABLE course_holes
  ADD CONSTRAINT course_holes_course_id_section_hole_key
    UNIQUE (course_id, course_section, hole_number);

-- ③ rounds に選択セクションを保存する列を追加
--   36H: out_section のみ使用
--   27H: out_section（前半9番）・in_section（後半9番）両方使用
ALTER TABLE rounds
  ADD COLUMN out_section TEXT,
  ADD COLUMN in_section  TEXT;
