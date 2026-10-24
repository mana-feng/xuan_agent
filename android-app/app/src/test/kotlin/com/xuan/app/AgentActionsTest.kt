package com.xuan.app

import org.junit.Assert.*
import org.junit.Test

class AgentActionsTest {
    private fun marker(json:String) = "<!--AGENT_ACTION:$json-->"
    private fun run(type:String="run_bazi_chart", payload:String=""""date":"1998-08-12","time":"09:00","gender":0""") =
        marker("""{"type":"$type","payload":{$payload}}""")

    @Test fun birthActionsRequireCompleteValidatedSolarData() {
        val bazi=AgentActions.parse(run())!!
        assertEquals("bazi",bazi.target)
        assertTrue(bazi.execute)
        assertEquals("1998-08-12 09:00",bazi.input!!.civil)
        assertEquals(0,bazi.input!!.gender)
        assertEquals("Asia/Shanghai",bazi.input!!.timeZone)
        val ziwei=AgentActions.parse(run("run_ziwei_chart",""""date":"1996-03-21","time":"18:30","gender":1,"realname":"小明","timeZone":"+08:00","focusPalace":"事业宫""""))!!
        assertEquals("ziwei",ziwei.target)
        assertEquals(1,ziwei.input!!.gender)
        assertEquals("小明",ziwei.input!!.title)
        assertEquals("+08:00",ziwei.input!!.timeZone)
    }

    @Test fun missingBirthFieldsNeverBecomeInventedInputs() {
        for(payload in listOf(""""date":"1998-08-12","gender":0""",""""date":"1998-08-12","time":"09:00"""",""""time":"09:00","gender":1""")) {
            assertNull(payload,AgentActions.parse(run(payload=payload)))
        }
    }

    @Test fun liuyaoDateMustBeExplicitToExecute() {
        val noTime=AgentActions.parse(run("run_liuyao_chart",""""title":"换工作是否合适""""))!!
        assertEquals("liuyao",noTime.target)
        assertFalse(noTime.execute)
        assertNull(noTime.input)
        val halfTime=AgentActions.parse(run("run_liuyao_chart",""""title":"换工作是否合适","date":"2024-02-10""""))!!
        assertFalse(halfTime.execute)
        val full=AgentActions.parse(run("run_liuyao_chart",""""title":"换工作是否合适","date":"2024-02-10","time":"23:00""""))!!
        assertTrue(full.execute)
        assertEquals("换工作是否合适",full.input!!.title)
        assertEquals("2024-02-10 23:00",full.input!!.civil)
        assertNull(AgentActions.parse(run("run_liuyao_chart",""""date":"2024-02-10","time":"23:00"""")))
    }

    @Test fun wrongJsonPrimitiveTypesAreRejectedInsteadOfCoerced() {
        for(gender in listOf("true","false","\"0\"","\"男\"","0.0","2","null","{}","[]")) {
            assertNull(gender,AgentActions.parse(run(payload=""""date":"1998-08-12","time":"09:00","gender":$gender""")))
        }
        for(payload in listOf(""""date":19980812,"time":"09:00","gender":0""",""""date":"1998-08-12","time":900,"gender":0""",""""title":false""")) {
            assertNull(payload,AgentActions.parse(run(payload=payload)))
        }
        assertNull(AgentActions.parse(marker("""{"type":"navigate","target":"bazi","label":false}""")))
    }

    @Test fun invalidDatesZonesAndDstAmbiguityCannotExecute() {
        for(payload in listOf(
            """"date":"2024-02-30","time":"09:00","gender":0""",
            """"date":"2024-2-10","time":"09:00","gender":0""",
            """"date":"2024-02-10","time":"24:00","gender":0""",
            """"date":"1899-12-31","time":"09:00","gender":0""",
            """"date":"2024-02-10","time":"09:00","gender":0,"timeZone":"Bad/Zone"""",
            """"date":"2024-03-10","time":"02:30","gender":0,"timeZone":"America/New_York"""",
            """"date":"2024-11-03","time":"01:30","gender":0,"timeZone":"America/New_York""""
        )) assertNull(payload,AgentActions.parse(run(payload=payload)))
        assertNotNull(AgentActions.parse(run(payload=""""date":"2024-11-03","time":"01:30","gender":0,"timeZone":"-04:00"""")))
    }

    @Test fun navigationIsAnAllowlistAndNeverExecutesAChart() {
        for(target in listOf("bazi","liuyao","ziwei","qimen","history")) {
            val action=AgentActions.parse(marker("""{"type":"navigate","target":"$target","label":"打开页面","extra":{"ignored":true}}"""))!!
            assertEquals(target,action.target)
            assertFalse(action.execute)
            assertNull(action.input)
        }
        for(json in listOf(
            """{"type":"navigate","target":"https://example.com"}""",
            """{"type":"run_qimen_chart","payload":{}}""",
            """{"type":"eval","code":"alert(1)"}""",
            """{"type":"focus_ziwei_palace","payload":{"palace":"事业宫"}}""",
            """{"type":"none"}"""
        )) assertNull(json,AgentActions.parse(marker(json)))
    }

    @Test fun malformedDuplicateAndOversizedCommandsAreRejected() {
        val good=run()
        assertNull(AgentActions.parse(good+"\n"+good))
        assertNull(AgentActions.parse("请执行 "+good))
        assertNull(AgentActions.parse("~~~json\n"+good+"\n~~~"))
        assertNull(AgentActions.parse("${good.dropLast(3)}"))
        assertNull(AgentActions.parse(marker("""{"type":"navigate","target":"bazi","type":"none"}""")))
        assertNull(AgentActions.parse(marker("""{type:"navigate",target:"bazi"}""")))
        assertNull(AgentActions.parse(marker("""{"type":"navigate","target":"bazi",}""")))
        assertNull(AgentActions.parse(marker("""{"type":"navigate","target":"bazi"} {"type":"none"}""")))
        assertNull(AgentActions.parse(marker("""{"type":"navigate","target":"bazi","reason":"${"x".repeat(9000)}"}""")))
        assertNull(AgentActions.parse("x".repeat(70000)+"\n"+good))
    }

    @Test fun visibleTextRemovesAllCompleteAndTruncatedCommands() {
        val text="推荐工具：八字\n"+run()+"\n下一步：请确认\n"+marker("""{"type":"none"}""")
        assertEquals("推荐工具：八字\n\n下一步：请确认",AgentActions.visibleText(text))
        assertEquals("请补充出生时辰",AgentActions.visibleText("请补充出生时辰\n<!--AGENT_ACTION:{broken"))
        assertNull(AgentActions.parse("未给出操作标记的普通文本"))
    }
}
