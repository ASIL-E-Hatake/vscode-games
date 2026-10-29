import { describe, expect, it } from 'vitest';
import { applyServerXml } from './runtime-config-docker';
import { generateText } from './runtime-configs';

// 公式の Tomcat の server.xml を短くしたもの（コメントの中の例も残す）
const STOCK = `<?xml version="1.0" encoding="UTF-8"?>
<Server port="8005" shutdown="SHUTDOWN">
  <Service name="Catalina">
    <!-- <Connector port="8080" protocol="HTTP/1.1" connectionTimeout="20000" /> -->
    <Connector port="8080" protocol="HTTP/1.1"
               connectionTimeout="20000"
               redirectPort="8443"
               maxParameterCount="1000"
               />
    <!-- <Engine name="Catalina" defaultHost="localhost" jvmRoute="jvm1"> -->
    <Engine name="Catalina" defaultHost="localhost">
      <Host name="localhost"  appBase="webapps" unpackWARs="true" autoDeploy="true">
        <Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs"
               prefix="localhost_access_log" suffix=".txt"
               pattern="%h %l %u %t &quot;%r&quot; %s %b" />
      </Host>
    </Engine>
  </Service>
</Server>
`;

describe('applyServerXml（L2 の検査で server.xml に変更を当てる）', () => {
  it('①〜④を当てる', () => {
    const xml = applyServerXml(STOCK, generateText('tomcat-server-xml'));
    expect(xml).toContain('<Server port="-1" shutdown="SHUTDOWN">');
    expect(xml).not.toContain('8005');
    expect(xml).toContain('<Connector address="127.0.0.1" port="8080"');
    expect(xml).not.toContain('redirectPort');
    expect(xml).toMatch(
      /<Engine name="Catalina" defaultHost="localhost">\s*<Valve className="org\.apache\.catalina\.valves\.RemoteIpValve"/,
    );
    expect(xml).toContain('requestAttributesEnabled="true"');
    expect(xml).toMatch(/AccessLogValve[\s\S]*ErrorReportValve[\s\S]*<\/Host>/);
  });

  it('当てる場所が見つからなければ例外（黙って通さない）', () => {
    expect(() =>
      applyServerXml(STOCK.replace('8005', '8006'), generateText('tomcat-server-xml')),
    ).toThrow();
  });
});
