<#macro box>
  <div class="box"><#nested></div>
</#macro>

<#macro list items>
  <#list items as item>
    <#nested item, item?index>
  </#list>
</#macro>
