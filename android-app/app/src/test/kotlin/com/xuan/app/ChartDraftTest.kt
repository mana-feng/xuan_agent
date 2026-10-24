package com.xuan.app
import org.junit.Assert.*
import org.junit.Test
import com.xuan.core.*
class ChartDraftTest {
    @Test fun restoresLunarAndManualOptionsWithoutReinterpretingDate() {
        val raw=ChartInput("2023-02-16 09:30",title="原始输入")
        val options=FormOptions(true,true,"手动","",listOf(4,1,0,3,0,1))
        val resolved=ChartDraft.resolve(raw,options)
        assertEquals("2023-04-06 09:30",resolved.civil)
        val result=ChartDraft.tag(ChartResult("liuyao","盘",listOf(ChartSection("卦",emptyList())),emptyMap()),raw,options)
        val restored=ChartDraft.restore(SavedChart("id",1,resolved,result))
        assertEquals(raw,restored.first);assertEquals(options,restored.second)
        assertEquals(resolved,ChartDraft.resolve(restored.first,restored.second))
    }
    @Test fun persistsNumberCastingAndUsesOldLineSnapshotIfNoCastingMetadata() {
        val raw=ChartInput("2023-03-21 12:00")
        val options=FormOptions(casting="数字",numbers="3 8 6")
        val result=ChartDraft.tag(ChartResult("liuyao","盘",emptyList(),mapOf("原始爻" to "0,1,3,4,0,1")),raw,options)
        assertEquals(options,ChartDraft.restore(SavedChart("id",1,raw,result)).second)
        val old=SavedChart("old",1,raw,result.copy(metadata=mapOf("原始爻" to "0,1,3,4,0,1")))
        assertEquals("手动",ChartDraft.restore(old).second.casting)
        assertEquals(listOf(0,1,3,4,0,1),ChartDraft.restore(old).second.manual)
    }
    @Test fun namedZiweiResultKeepsTheUserTitleForHistoryAndExport() {
        val input=ChartInput("2023-03-21 12:00",title="张三的命盘")
        val result=ChartDraft.tag(ChartResult("ziwei","紫微斗数",emptyList(),emptyMap()),input,FormOptions())
        assertEquals("张三的命盘",result.title)
    }
}
