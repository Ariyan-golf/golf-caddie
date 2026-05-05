-- Allow users to delete their own shot_distances records
CREATE POLICY "Users can delete their own shot distances"
  ON shot_distances FOR DELETE
  USING (auth.uid() = user_id);
