package com.example.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// L2 の検査専用。demo.exit-after-start=true なら、起動しきったところで終了コード 0 で終わる
// （「壊さなければ起動する」ことを、待ち続けずに確かめるため）
@Configuration
public class ExitAfterStart {
  @Bean
  ApplicationRunner exitAfterStartRunner(
      ConfigurableApplicationContext context,
      @Value("${demo.exit-after-start:false}") boolean exit) {
    return args -> {
      if (exit) {
        System.out.println("demo: started and exiting");
        System.exit(SpringApplication.exit(context, () -> 0));
      }
    };
  }
}
