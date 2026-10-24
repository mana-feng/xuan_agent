package com.xuan.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Native presentation of the existing website's About content and illustration. */
@Composable internal fun WebAboutPage() {
 val p=LocalWebPalette.current
 Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {
  WebHeading("关于","一段关于作者的玄学求学故事")
  WebCard("作者经历") {
   Image(painterResource(R.drawable.about_diploma),contentDescription="作者经历配图",contentScale=ContentScale.Fit,
    modifier=Modifier.fillMaxWidth().aspectRatio(1.35969388f).clip(RoundedCornerShape(12.dp)))
   Text("作者在 Wild Chicken University 完成玄学方向博士（PhD）学习，主攻传统命理的现代化表达与应用。",fontSize=14.sp,lineHeight=24.sp,color=p.ink)
   Text("这段求学历程强调“古法与现代工具结合”，在严谨的学术训练中，将八字、六爻的经典体系与可视化表达融合。",fontSize=14.sp,lineHeight=24.sp,color=p.ink)
   Text("如今，玄学 AI 便是这段研究的延伸：让排盘与解析更易用、更清晰，也更具可解释性。",fontSize=14.sp,lineHeight=24.sp,color=p.ink)
  }
  WebCard("学习片段") {
   Text("• 在校期间完成《传统命理的结构化表达》与《六爻信息层级模型》两门核心课题。",fontSize=13.sp,lineHeight=24.sp,color=p.ink)
   Text("• 建立“排盘一致性标准”，确保不同历法与算法下的输出稳定可追溯。",fontSize=13.sp,lineHeight=24.sp,color=p.ink)
   Text("• 以“人可读”的方式呈现推演逻辑，让分析过程更透明。",fontSize=13.sp,lineHeight=24.sp,color=p.ink)
  }
  WebCard("温馨提示") {
   Text("以上内容均为娱乐性质，仅供娱乐。",fontSize=12.sp,lineHeight=24.sp,color=p.muted)
   Text("玄学文化源远流长，但请勿过度依赖或迷信。",fontSize=12.sp,lineHeight=24.sp,color=p.muted)
   Text("生活中的重要决策，请结合实际情况理性判断。",fontSize=12.sp,lineHeight=24.sp,color=p.muted)
  }
 }
}
