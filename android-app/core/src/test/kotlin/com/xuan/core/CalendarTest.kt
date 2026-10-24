package com.xuan.core

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class CalendarTest {
    private val calendar = CalendarEngine()
    @Test fun lunarLeapMonthBoundary() {
        assertEquals(LunarDate(2023, 2, 1, true, 29), calendar.lunar(LocalDate.of(2023, 3, 22)))
        assertEquals(LocalDate.of(2023,4,6), calendar.solar(2023,2,16,true))
        assertEquals(1, calendar.lunar(LocalDate.of(2023,4,20)).day)
    }
    @Test fun pillarsMatchFrozenReference() {
        assertEquals(listOf("癸卯","乙卯","戊寅","壬子"), calendar.pillars(ChartInput("2023-03-21 00:30")).list())
    }
    @Test fun rejectsCivilNormalizationAndDstGaps() {
        listOf(ChartInput("2023-02-30 12:00"), ChartInput("2024-03-10 02:30","America/New_York"), ChartInput("2024-11-03 01:30","America/New_York")).forEach { input ->
            assertThrows(IllegalArgumentException::class.java) { calendar.civil(input) }
        }
    }
    @Test fun dayBoundaryIsExplicit() {
        val a = ChartInput("2023-03-21 23:00")
        assertEquals("戊寅", calendar.pillars(a).day)
        assertEquals("己卯", calendar.pillars(a.copy(dayDivide="zi")).day)
        assertEquals("甲子", calendar.pillars(a).hour)
    }
}
