<%-- L2（実行環境の設定）の検査専用の最小の war（scripts/runtime-config-e2e.ts が jar で固める）。
     Nginx 経由で来たリクエストを Tomcat の RemoteIpValve が直しているか（https・利用者の IP）を返す --%><%@ page contentType="text/plain; charset=UTF-8" %>hello-runtime
scheme=<%= request.getScheme() %>
secure=<%= request.isSecure() %>
remoteAddr=<%= request.getRemoteAddr() %>
url=<%= request.getRequestURL() %>
