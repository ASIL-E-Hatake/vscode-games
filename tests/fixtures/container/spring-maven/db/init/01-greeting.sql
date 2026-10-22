-- L2（コンテナ）の検査専用。初期化 SQL のフォルダが DB に渡ることを確かめる
CREATE TABLE greeting (name TEXT NOT NULL);
INSERT INTO greeting (name) VALUES ('hello');
