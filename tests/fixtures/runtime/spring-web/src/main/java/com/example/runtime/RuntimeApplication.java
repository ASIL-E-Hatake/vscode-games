package com.example.runtime;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// L2（実行環境の設定）の検査専用。Nginx 経由で来たリクエストが https・利用者の IP として見えるかを返す
@SpringBootApplication
@RestController
public class RuntimeApplication {
  public static void main(String[] args) {
    SpringApplication.run(RuntimeApplication.class, args);
  }

  @GetMapping(value = "/", produces = "text/plain")
  public String index(HttpServletRequest request) {
    return "hello-spring\n"
        + "scheme=" + request.getScheme() + "\n"
        + "secure=" + request.isSecure() + "\n"
        + "remoteAddr=" + request.getRemoteAddr() + "\n"
        + "url=" + request.getRequestURL() + "\n";
  }
}
