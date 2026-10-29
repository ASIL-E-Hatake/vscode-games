package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// L2（Spring Boot の起動エラー）の検査専用。設定だけを壊す例（application.properties）はこのクラスで起動する。
// コードを壊す例は、検査スクリプトが例ごとのパッケージ（com.example.cases.*）に起動用のクラスを作って起動する
@SpringBootApplication
public class DemoApplication {
  public static void main(String[] args) {
    SpringApplication.run(DemoApplication.class, args);
  }
}
