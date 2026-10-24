package com.xuan.core

import org.junit.Assert.*
import org.junit.Test

class QimenTest {
    // Detects wrong term instants, FuTou, raw center-five counting, star rotation and hidden stems.
    @Test fun allBoardPositionsMatchFrozenFrontend() {
        javaClass.classLoader!!.getResourceAsStream("qimen-reference.tsv")!!.bufferedReader().readLines().forEach { row ->
            val (civil, expected) = row.split('\t')
            assertEquals(civil,expected,QimenEngine().chart(ChartInput(civil.replace('T',' '),timeZone="+08:00")).signature())
        }
    }
    @Test fun sameInstantUsesFixedBeijingClockAndZiBoundary() {
        val engine = QimenEngine()
        val beijing=engine.chart(ChartInput("2024-02-10 23:00:00",timeZone="+08:00"))
        val utc=engine.chart(ChartInput("2024-02-10 15:00:00",timeZone="UTC"))
        assertEquals(beijing.signature(),utc.signature())
        assertEquals("乙巳",beijing.pillars.day)
        val result=engine.calculate(ChartInput("2024-02-10 15:00:00",timeZone="UTC"))
        assertEquals("qimen",result.type)
        assertEquals(9,result.sections.count { it.title.endsWith("宫") })
        assertEquals("北京时间 UTC+08:00",result.metadata["计算时钟"])
        assertFalse(result.asText().contains("综断"))
    }
}



private fun QimenChart.signature():String = (pillars.list()+listOf(term,yinYang,number.toString(),yuan,xun,dayXun,zhiFuPalace.toString(),
        zhiFuOrigin.toString(),zhiFuStar,zhiShiPalace.toString(),zhiShiDoor,emptyBranches.joinToString(","),
        emptyPalaces.joinToString(","),horseBranch,horsePalace.toString())+
        listOf(earth,heaven,stars,doors,spirits,hidden).map { board -> (1..9).joinToString(",") { board[it]?:"" } }).joinToString("|")
