// L1: Spring Boot の起動エラーの検査の組み立て（spring-errors-cases.ts）と、
// 実際の起動ログ（npm run test:spring-errors で出たものの抜粋）を貼り付けたときに、そのエラーが先頭に来ること
import { describe, expect, it } from 'vitest';
import { searchErrors } from '../src/features/error-dict/logic';
import {
  BUILD_JAVA,
  casePackage,
  configName,
  controlCases,
  dockerfile,
  errorCase,
  javaArgs,
  javaVersions,
  loadImages,
  loadSpringErrors,
} from './spring-errors-cases';

const errors = loadSpringErrors();
const top = (pasted: string) => searchErrors(errors, pasted, 'spring-boot')[0]?.error.id;

/** 実際の起動ログの抜粋（JPA を使うアプリでは、DB の接続の失敗の後に Dialect のエラーと BeanCreationException が続く） */
const DIALECT = `ERROR 1 --- [main] j.LocalContainerEntityManagerFactoryBean : Failed to initialize JPA EntityManagerFactory: Unable to create requested service [org.hibernate.engine.jdbc.env.spi.JdbcEnvironment] due to: Unable to determine Dialect without JDBC metadata
org.springframework.beans.factory.BeanCreationException: Error creating bean with name 'entityManagerFactory' defined in class path resource [org/springframework/boot/autoconfigure/orm/jpa/HibernateJpaConfiguration.class]`;
const FAILED = `***************************
APPLICATION FAILED TO START
***************************

Description:
`;

describe('実際の起動ログを貼り付けると、そのエラーが先頭に来る', () => {
  const cases: [string, string][] = [
    [
      'spring-boot-datasource',
      `${FAILED}Failed to configure a DataSource: 'url' attribute is not specified and no embedded datasource could be configured.`,
    ],
    [
      'spring-boot-port-in-use',
      `${FAILED}Web server failed to start. Port 8080 was already in use.`,
    ],
    ['spring-boot-port-in-use', 'Port 8080 was already in use'],
    [
      'spring-boot-no-such-bean',
      `WARN 1 --- [main] ConfigServletWebServerApplicationContext : Exception encountered during context initialization - cancelling refresh attempt: org.springframework.beans.factory.UnsatisfiedDependencyException: Error creating bean with name 'orderService': Unsatisfied dependency expressed through constructor parameter 0: No qualifying bean of type 'com.example.PaymentClient' available
${FAILED}Parameter 0 of constructor in com.example.OrderService required a bean of type 'com.example.PaymentClient' that could not be found.

Action:

Consider defining a bean of type 'com.example.PaymentClient' in your configuration.`,
    ],
    [
      'spring-boot-no-unique-bean',
      `org.springframework.beans.factory.UnsatisfiedDependencyException: Error creating bean with name 'signupService': Unsatisfied dependency expressed through constructor parameter 0: No qualifying bean of type 'com.example.Notifier' available: expected single matching bean but found 2: chatNotifier,mailNotifier`,
    ],
    [
      'spring-boot-circular',
      `${FAILED}The dependencies of some of the beans in the application context form a cycle:`,
    ],
    [
      'spring-boot-placeholder',
      `org.springframework.beans.factory.BeanCreationException: Error creating bean with name 'apiClient': Unexpected exception during bean creation
Caused by: org.springframework.util.PlaceholderResolutionException: Could not resolve placeholder 'app.api-url' in value "\${app.api-url}"`,
    ],
    [
      'spring-boot-postgres-refused',
      `Caused by: org.postgresql.util.PSQLException: Connection to localhost:5432 refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.\n${DIALECT}`,
    ],
    [
      'spring-boot-postgres-no-database',
      `Caused by: org.postgresql.util.PSQLException: FATAL: database "shop" does not exist\n${DIALECT}`,
    ],
    ['spring-boot-postgres-no-database', 'FATAL: database "shop" does not exist'],
    [
      'spring-boot-mysql-communications',
      `Caused by: com.mysql.cj.exceptions.CJCommunicationsException: Communications link failure

The last packet sent successfully to the server was 0 milliseconds ago. The driver has not received any packets from the server.
Caused by: java.net.ConnectException: Connection refused\n${DIALECT}`,
    ],
    [
      'spring-boot-mysql-access-denied',
      `Caused by: java.sql.SQLException: Access denied for user 'app'@'172.29.0.5' (using password: YES)\n${DIALECT}`,
    ],
    [
      'spring-boot-mysql-unknown-database',
      `Caused by: java.sql.SQLSyntaxErrorException: Unknown database 'shop'\n${DIALECT}`,
    ],
    [
      'spring-boot-class-not-found',
      `org.springframework.beans.factory.BeanDefinitionStoreException: I/O failure while processing configuration class [com.example.LegacyFilter]
Caused by: java.io.IOException: Failed to load class [javax.servlet.Filter]
Caused by: java.lang.ClassNotFoundException: javax.servlet.Filter`,
    ],
    [
      'spring-boot-unsupported-class-version',
      'Error: LinkageError occurred while loading main class com.example.demo.DemoApplication\n\tjava.lang.UnsupportedClassVersionError: com/example/demo/DemoApplication has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0',
    ],
    [
      'spring-boot-failed-to-start',
      `${FAILED}The bean 'greeting', defined in class path resource [com/example/MessageConfig.class], could not be registered.`,
    ],
  ];
  for (const [id, pasted] of cases) {
    it(`${id}: ${pasted
      .split('\n')
      .find((l) => l.trim() && !l.startsWith('*'))
      ?.slice(0, 50)}`, () => {
      expect(top(pasted)).toBe(id);
    });
  }
});

describe('検査の組み立て', () => {
  it('例ごとのパッケージ名は Java のパッケージとして正しい', () => {
    expect(casePackage('spring-boot-no-such-bean')).toBe('com.example.cases.no_such_bean');
    expect(casePackage('（検査の確認）x')).toMatch(/^com\.example\.cases\.[a-z_][a-z0-9_]*$/);
    for (const e of errors)
      expect(casePackage(e.id)).toMatch(/^com\.example\.cases\.[a-z_][a-z0-9_]*$/);
  });

  it('place: java は例のコードに package 文を付け、例のパッケージの起動用クラスで起動する', () => {
    const c = errorCase(errors.find((e) => e.id === 'spring-boot-circular')!);
    const files = Object.keys(c.sources);
    expect(files).toEqual([
      'com/example/cases/circular/Example.java',
      'com/example/cases/circular/CaseApplication.java',
    ]);
    expect(c.sources[files[0]!]).toMatch(/^package com\.example\.cases\.circular;\n/);
    expect(c.main).toBe('com.example.cases.circular.CaseApplication');
    expect(c.config).toBe('');
  });

  it('place: properties は例を設定として読み、base: false なら base.properties を読まない', () => {
    const c = errorCase(errors.find((e) => e.id === 'spring-boot-datasource')!);
    expect(c.sources).toEqual({});
    expect(c.base).toBe(false);
    expect(c.config).toContain('spring.application.name=demo');
    expect(javaArgs(c)).toContain(
      `--spring.config.location=file:/app/config/${configName(c)}.properties`,
    );
    const port = errorCase(errors.find((e) => e.id === 'spring-boot-port-in-use')!);
    expect(port.occupyPort).toBe(8080);
    expect(javaArgs(port)).toContain(
      `--spring.config.location=file:/app/config/base.properties,file:/app/config/${configName(port)}.properties`,
    );
  });

  it('検査の確認（壊さなければ起動する）は、起動に成功することを期待する', () => {
    const controls = controlCases();
    expect(controls.length).toBeGreaterThanOrEqual(3);
    expect(controls.every((c) => c.expectStart && !c.entry)).toBe(true);
    expect(controls.some((c) => c.main.endsWith('.CaseApplication'))).toBe(true);
  });

  it('Dockerfile のイメージは images.yaml から取り、使う Java の版ごとに実行用のターゲットを作る', () => {
    const cases = errors.map(errorCase);
    const versions = javaVersions(cases);
    expect(versions[0]).toBe(BUILD_JAVA);
    expect(versions).toContain('17');
    const text = dockerfile(loadImages(), versions);
    expect(text).toContain('FROM maven:3.9-eclipse-temurin-21 AS build');
    expect(text).toContain('FROM eclipse-temurin:21-jre AS jre21');
    expect(text).toContain('FROM eclipse-temurin:17-jre AS jre17');
    expect(() => dockerfile(loadImages(), ['8'])).toThrow(/temurin-jre の 8/);
  });
});
