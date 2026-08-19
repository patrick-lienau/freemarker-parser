<#list items as item>
  <#if !item.visible><#continue></#if>
  ${item.name}
<#sep>, </#sep>
</#list>

<#list items as item>${item}<#sep>, </#list>

<@liferay_util["html-top"]>
  <link rel="stylesheet" href="x.css"/>
</@>

<@liferay_ui["message"] key="welcome" />
